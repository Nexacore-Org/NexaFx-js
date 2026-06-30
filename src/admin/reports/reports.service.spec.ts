import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReportsService } from './reports.service';
import {
  Transaction,
  TransactionStatus,
} from '../../transactions/transaction.entity';
import { User } from '../../users/user.entity';

// Minimal query builder stub
const makeQb = (rawResult: unknown) => {
  const qb: Record<string, jest.Mock> = {};
  const chain = () => qb as never;
  [
    'select',
    'addSelect',
    'where',
    'andWhere',
    'groupBy',
    'addGroupBy',
    'orderBy',
  ].forEach((m) => {
    qb[m] = jest.fn().mockReturnValue(chain());
  });
  qb['getRawOne'] = jest.fn().mockResolvedValue(rawResult);
  qb['getRawMany'] = jest.fn().mockResolvedValue(rawResult);
  return qb;
};

const mockTxRepo = () => ({ createQueryBuilder: jest.fn() });
const mockUserRepo = () => ({ createQueryBuilder: jest.fn() });

describe('ReportsService', () => {
  let service: ReportsService;
  let txRepo: ReturnType<typeof mockTxRepo>;
  let userRepo: ReturnType<typeof mockUserRepo>;

  const from = new Date('2026-01-01T00:00:00Z');
  const to = new Date('2026-01-31T23:59:59Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getRepositoryToken(Transaction), useFactory: mockTxRepo },
        { provide: getRepositoryToken(User), useFactory: mockUserRepo },
      ],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
    txRepo = module.get(getRepositoryToken(Transaction));
    userRepo = module.get(getRepositoryToken(User));
  });

  describe('revenueReport', () => {
    it('sums fees for completed transactions in date range', async () => {
      const qb = makeQb({ totalFees: '150.50' });
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.revenueReport(from, to, 'USD');

      expect(result.totalFees).toBeCloseTo(150.5);
      expect(result.currency).toBe('USD');
      expect(result.from).toBe(from);
      expect(result.to).toBe(to);
    });

    it('returns zero fees when no completed transactions exist', async () => {
      const qb = makeQb({ totalFees: '0' });
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.revenueReport(from, to, 'EUR');

      expect(result.totalFees).toBe(0);
    });

    it('returns zero fees for empty date range (from equals to)', async () => {
      const sameDay = new Date('2026-01-15T00:00:00Z');
      const qb = makeQb(null);
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.revenueReport(sameDay, sameDay, 'USD');

      expect(result.totalFees).toBe(0);
    });
  });

  describe('transactionVolume', () => {
    it('returns count and sum grouped by currency and status', async () => {
      const rows = [
        {
          currency: 'USD',
          status: 'completed',
          count: '10',
          totalAmount: '5000.00',
        },
        {
          currency: 'EUR',
          status: 'pending',
          count: '3',
          totalAmount: '750.00',
        },
      ];
      const qb = makeQb(rows);
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.transactionVolume(from, to);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        currency: 'USD',
        count: 10,
        totalAmount: 5000,
      });
      expect(result[1]).toMatchObject({
        currency: 'EUR',
        count: 3,
        totalAmount: 750,
      });
    });

    it('returns empty array when no transactions in date range', async () => {
      const qb = makeQb([]);
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.transactionVolume(from, to, {
        currency: 'GBP',
      });

      expect(result).toEqual([]);
    });

    it('filters by status when provided', async () => {
      const rows = [
        {
          currency: 'USD',
          status: 'completed',
          count: '5',
          totalAmount: '2500.00',
        },
      ];
      const qb = makeQb(rows);
      txRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.transactionVolume(from, to, {
        status: TransactionStatus.COMPLETED,
      });

      expect(result[0].status).toBe(TransactionStatus.COMPLETED);
      // andWhere should have been called with the status filter
      expect(qb['andWhere']).toHaveBeenCalledWith('tx.status = :status', {
        status: TransactionStatus.COMPLETED,
      });
    });
  });

  describe('userGrowth', () => {
    it('returns weekly registration counts', async () => {
      const rows = [
        { week: '2026-01-05', registrations: '12' },
        { week: '2026-01-12', registrations: '8' },
      ];
      const qb = makeQb(rows);
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.userGrowth(from, to);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        week: '2026-01-05',
        registrations: 12,
      });
      expect(result[1]).toMatchObject({ week: '2026-01-12', registrations: 8 });
    });

    it('returns empty array for date range with no registrations', async () => {
      const qb = makeQb([]);
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.userGrowth(from, to);

      expect(result).toEqual([]);
    });

    it('handles date boundary — same day from and to returns at most one week bucket', async () => {
      const sameDay = new Date('2026-01-15T00:00:00Z');
      const qb = makeQb([{ week: '2026-01-12', registrations: '1' }]);
      userRepo.createQueryBuilder.mockReturnValue(qb);

      const result = await service.userGrowth(sameDay, sameDay);

      expect(result.length).toBeLessThanOrEqual(1);
    });
  });
});
