import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BulkPaymentsService } from './bulk-payments.service';
import { BulkPaymentEntity } from './entities/bulk-payment.entity';
import { BulkPaymentItemEntity } from './entities/bulk-payment-item.entity';
import { TransactionEntity } from '../modules/transactions/entities/transaction.entity';
import { AccountFreezeService } from '../modules/account-freeze/services/account-freeze.service';

/**
 * #1585: BulkPaymentsService had no tests. Covers the final status calculation
 * (completed / partial / failed), the frozen-account short-circuit, per-item
 * failure isolation, the completion event and pagination/ownership.
 */
describe('BulkPaymentsService (#1585)', () => {
  let service: BulkPaymentsService;
  let bulkPaymentRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    findAndCount: jest.Mock;
  };
  let bulkPaymentItemRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    update: jest.Mock;
  };
  let transactionRepo: { create: jest.Mock; save: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let accountFreezeService: {
    assertNotFrozen: jest.Mock;
    isAccountFrozen: jest.Mock;
  };

  const batch = {
    id: 'bp-1',
    userId: 'user-1',
    status: 'processing',
    currency: 'USD',
  };

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(async () => {
    bulkPaymentRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'bp-1', ...value })),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    bulkPaymentItemRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    transactionRepo = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'tx-1', ...value })),
    };
    eventEmitter = { emit: jest.fn() };
    accountFreezeService = {
      assertNotFrozen: jest.fn().mockResolvedValue(undefined),
      isAccountFrozen: jest.fn().mockResolvedValue(false),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BulkPaymentsService,
        { provide: getRepositoryToken(BulkPaymentEntity), useValue: bulkPaymentRepo },
        {
          provide: getRepositoryToken(BulkPaymentItemEntity),
          useValue: bulkPaymentItemRepo,
        },
        { provide: getRepositoryToken(TransactionEntity), useValue: transactionRepo },
        { provide: EventEmitter2, useValue: eventEmitter },
        { provide: AccountFreezeService, useValue: accountFreezeService },
      ],
    }).compile();

    service = module.get(BulkPaymentsService);
  });

  describe('create', () => {
    const dto = {
      currency: 'usd',
      items: [
        { recipientAddress: 'gaddr-1', amount: 10 },
        { recipientAddress: 'gaddr-2', amount: 5 },
      ],
    };

    it('rejects the batch when the account is frozen', async () => {
      accountFreezeService.assertNotFrozen.mockRejectedValue(
        new Error('Account frozen'),
      );

      await expect(
        service.create('user-1', dto as never),
      ).rejects.toThrow('Account frozen');
      expect(bulkPaymentRepo.save).not.toHaveBeenCalled();
    });

    it('stores the batch and schedules processing', async () => {
      const processSpy = jest
        .spyOn(
          service as unknown as {
            processBulkPayment(id: string): Promise<void>;
          },
          'processBulkPayment',
        )
        .mockResolvedValue(undefined);

      const result = await service.create('user-1', dto as never);
      await flush();

      expect(result.data).toMatchObject({ totalCount: 2, totalAmount: 15 });
      expect(bulkPaymentItemRepo.save).toHaveBeenCalledTimes(1);
      expect(processSpy).toHaveBeenCalledWith('bp-1');
    });
  });

  describe('processBulkPayment final status', () => {
    const runProcess = () =>
      (service as unknown as { processBulkPayment(id: string): Promise<void> }) //
        .processBulkPayment('bp-1');

    beforeEach(() => {
      bulkPaymentRepo.findOne.mockResolvedValue(batch);
    });

    it('marks the batch completed when every item succeeds', async () => {
      bulkPaymentItemRepo.find.mockResolvedValue([
        { id: 'item-1', amount: 10, recipientAddress: 'gaddr-1' },
        { id: 'item-2', amount: 5, recipientAddress: 'gaddr-2' },
      ]);

      await runProcess();

      expect(bulkPaymentRepo.update).toHaveBeenLastCalledWith(
        'bp-1',
        expect.objectContaining({ status: 'completed', successCount: 2, failCount: 0 }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'bulk-payment.completed',
        expect.objectContaining({ bulkPaymentId: 'bp-1', status: 'completed' }),
      );
    });

    it('marks the batch partial when some items fail', async () => {
      bulkPaymentItemRepo.find.mockResolvedValue([
        { id: 'item-1', amount: 10, recipientAddress: 'gaddr-1' },
        { id: 'item-2', amount: 5, recipientAddress: 'gaddr-2' },
      ]);
      transactionRepo.save
        .mockResolvedValueOnce({ id: 'tx-1' })
        .mockRejectedValueOnce(new Error('provider down'));

      await runProcess();

      expect(bulkPaymentRepo.update).toHaveBeenLastCalledWith(
        'bp-1',
        expect.objectContaining({ status: 'partial', successCount: 1, failCount: 1 }),
      );
      // The failure is isolated to its own item row.
      expect(bulkPaymentItemRepo.update).toHaveBeenCalledWith(
        'item-2',
        expect.objectContaining({ status: 'failed', error: 'provider down' }),
      );
    });

    it('marks the batch failed when every item fails', async () => {
      bulkPaymentItemRepo.find.mockResolvedValue([
        { id: 'item-1', amount: 10, recipientAddress: 'gaddr-1' },
      ]);
      transactionRepo.save.mockRejectedValue(new Error('provider down'));

      await runProcess();

      expect(bulkPaymentRepo.update).toHaveBeenLastCalledWith(
        'bp-1',
        expect.objectContaining({ status: 'failed', successCount: 0, failCount: 1 }),
      );
    });

    it('fails the batch without processing items when the account got frozen', async () => {
      accountFreezeService.isAccountFrozen.mockResolvedValue(true);

      await runProcess();

      expect(bulkPaymentRepo.update).toHaveBeenCalledWith('bp-1', {
        status: 'failed',
      });
      expect(bulkPaymentItemRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('findAllByUser', () => {
    it('computes pagination metadata from the requested page', async () => {
      bulkPaymentRepo.findAndCount.mockResolvedValue([[{ id: 'bp-1' }], 45]);

      const result = await service.findAllByUser('user-1', 2, 20);

      expect(bulkPaymentRepo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 20, skip: 20 }),
      );
      expect(result.meta).toMatchObject({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
      });
    });
  });

  describe('findOne', () => {
    it('404s when the batch belongs to another user', async () => {
      bulkPaymentRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('bp-1', 'user-2')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(bulkPaymentRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'bp-1', userId: 'user-2' },
        relations: ['items'],
      });
    });
  });
});
