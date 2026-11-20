import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SpendingService } from './spending.service';
import { SpendingCategoryEntity } from './entities/spending-category.entity';
import { SpendingEntryEntity } from './entities/spending-entry.entity';

/**
 * #1585: SpendingService had no tests. Covers the period/date windows, the
 * category grouping (including the `uncategorized` bucket) and Big.js totals,
 * plus the ownership check in `createEntry`.
 */
describe('SpendingService (#1585)', () => {
  let service: SpendingService;
  let categoryRepo: {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let entryRepo: {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    categoryRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'cat-1', ...value })),
      remove: jest.fn(),
    };
    entryRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'entry-1', ...value })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpendingService,
        { provide: getRepositoryToken(SpendingCategoryEntity), useValue: categoryRepo },
        { provide: getRepositoryToken(SpendingEntryEntity), useValue: entryRepo },
      ],
    }).compile();

    service = module.get(SpendingService);
  });

  describe('createEntry', () => {
    it('404s when the category belongs to another user', async () => {
      categoryRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createEntry('user-1', {
          categoryId: 'cat-other',
          amount: 10,
          date: '2026-01-01',
        } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(entryRepo.save).not.toHaveBeenCalled();
    });

    it('saves an entry scoped to the caller', async () => {
      categoryRepo.findOne.mockResolvedValue({ id: 'cat-1', userId: 'user-1' });

      const entry = await service.createEntry('user-1', {
        categoryId: 'cat-1',
        amount: 12.5,
        date: '2026-01-01',
        description: 'lunch',
      } as never);

      expect(entry).toMatchObject({
        userId: 'user-1',
        categoryId: 'cat-1',
        amount: 12.5,
      });
      expect(entryRepo.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('getSummary', () => {
    it('sums totals with exact decimals and groups by category', async () => {
      entryRepo.find.mockResolvedValue([
        {
          amount: 10,
          categoryId: 'cat-food',
          category: { name: 'Food', color: '#111111' },
        },
        {
          amount: 2.5,
          categoryId: 'cat-food',
          category: { name: 'Food', color: '#111111' },
        },
        { amount: 7.5 },
      ]);

      const summary = await service.getSummary('user-1', { period: 'month' });

      expect(summary.data.transactionCount).toBe(3);
      expect(summary.data.byCurrency).toEqual({ USD: '20' });
      expect(summary.data.totalSpent).toBe(20);
      expect(summary.data.categoryBreakdown).toEqual([
        {
          categoryId: 'cat-food',
          name: 'Food',
          color: '#111111',
          total: 12.5,
          count: 2,
        },
        {
          categoryId: 'uncategorized',
          name: 'Uncategorized',
          color: '#6B7280',
          total: 7.5,
          count: 1,
        },
      ]);
    });

    it('uses an explicit start/end window when both dates are supplied', async () => {
      const start = '2026-01-01';
      const end = '2026-02-01';

      await service.getSummary('user-1', { startDate: start, endDate: end });

      const arg = entryRepo.find.mock.calls[0][0];
      expect(arg.where.date._type).toBe('between');
      expect(arg.where.date._value).toEqual([new Date(start), new Date(end)]);
    });

    it('uses a rolling seven-day window for the week period', async () => {
      await service.getSummary('user-1', { period: 'week' });

      const arg = entryRepo.find.mock.calls[0][0];
      const [from, to] = arg.where.date._value as [Date, Date];
      const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
      expect(arg.where.date._type).toBe('between');
      expect(days).toBe(7);
    });

    it('returns empty totals when there are no entries', async () => {
      const summary = await service.getSummary('user-1', { period: 'month' });

      expect(summary.data.transactionCount).toBe(0);
      expect(summary.data.totalSpent).toBe(0);
      expect(summary.data.categoryBreakdown).toEqual([]);
    });
  });
});
