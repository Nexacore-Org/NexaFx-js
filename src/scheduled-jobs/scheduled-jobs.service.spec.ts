import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';
import Redis from 'ioredis';

const makeConfig = () =>
  ({
    get: jest.fn((k: string) => {
      if (k === 'scheduledJobs.lockTtlMs') return 300_000;
      if (k === 'scheduledJobs.pendingTxTimeoutMinutes') return 30;
      return undefined;
    }),
  }) as unknown as ConfigService;

const makeTx = (id: string, overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id,
    senderId: 'user-1',
    receiverId: 'user-1',
    amount: 100,
    fee: 5,
    currency: 'USD',
    metadata: { type: 'withdrawal' },
    status: TransactionStatus.PENDING,
    pendingTimeoutAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    ...overrides,
  }) as Transaction;

describe('ScheduledJobsService', () => {
  let redis: jest.Mocked<Redis>;
  let txRepo: jest.Mocked<Repository<Transaction>>;
  let manager: { save: jest.Mock };
  let dataSource: DataSource;
  let wallets: { adjustBalance: jest.Mock };
  let audit: { log: jest.Mock };
  let svc: ScheduledJobsService;

  beforeEach(() => {
    redis = {
      set: jest.fn(),
      del: jest.fn(),
    } as unknown as jest.Mocked<Redis>;

    txRepo = {
      find: jest.fn(),
      save: jest.fn(async (e) => e),
    } as unknown as jest.Mocked<Repository<Transaction>>;

    manager = { save: jest.fn(async (_entity, e) => e) };
    dataSource = {
      transaction: jest.fn(async (run: (m: unknown) => Promise<unknown>) =>
        run(manager),
      ),
    } as unknown as DataSource;

    wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    svc = new ScheduledJobsService(
      redis,
      txRepo,
      {} as unknown as Repository<never>,
      {} as unknown as Repository<never>,
      makeConfig(),
      dataSource,
      wallets as unknown as WalletsService,
      audit as unknown as AuditService,
    );
  });

  it('skips reconciliation when job lock cannot be acquired', async () => {
    redis.set.mockResolvedValueOnce(null); // lock not acquired

    await svc.reconcilePendingTransactions();

    expect(txRepo.find).not.toHaveBeenCalled();
  });

  it('sets timed-out PENDING transactions to FAILED', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockResolvedValue([makeTx('tx-1')]);

    await svc.reconcilePendingTransactions();

    const saved = manager.save.mock.calls[0][1] as Transaction;
    expect(saved.id).toBe('tx-1');
    expect(saved.status).toBe(TransactionStatus.FAILED);
  });

  it('skips a transaction already being processed (duplicate lock)', async () => {
    redis.set
      .mockResolvedValueOnce('OK') // job lock
      .mockResolvedValueOnce(null); // tx lock already held

    txRepo.find.mockResolvedValue([makeTx('tx-2')]);

    await svc.reconcilePendingTransactions();

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('releases job lock after processing', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockResolvedValue([]);

    await svc.reconcilePendingTransactions();

    expect(redis.del).toHaveBeenCalledWith(
      'lock:scheduled-job:reconcile-pending-txs',
    );
  });

  it('releases job lock even when an error is thrown mid-run', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockRejectedValue(new Error('db error'));

    await expect(svc.reconcilePendingTransactions()).rejects.toThrow('db error');

    expect(redis.del).toHaveBeenCalledWith(
      'lock:scheduled-job:reconcile-pending-txs',
    );
  });

  it('releases per-tx lock after updating status', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockResolvedValue([makeTx('tx-3')]);

    await svc.reconcilePendingTransactions();

    expect(redis.del).toHaveBeenCalledWith('lock:tx-processing:tx-3');
  });

  describe('refunding the debited balance', () => {
    beforeEach(() => {
      redis.set.mockResolvedValue('OK');
    });

    it('credits back amount + fee for a timed-out withdrawal', async () => {
      txRepo.find.mockResolvedValue([makeTx('tx-w')]);

      await svc.reconcilePendingTransactions();

      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'user-1',
        'USD',
        105,
        manager,
      );
      const saved = manager.save.mock.calls[0][1] as Transaction;
      expect(saved.status).toBe(TransactionStatus.FAILED);
      expect(saved.metadata.autoFailRefundedAt).toEqual(expect.any(String));
    });

    it('credits back amount + fee for a timed-out swap', async () => {
      txRepo.find.mockResolvedValue([
        makeTx('tx-s', { metadata: { type: 'swap', toCurrency: 'EUR' } }),
      ]);

      await svc.reconcilePendingTransactions();

      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'user-1',
        'USD',
        105,
        manager,
      );
    });

    it('reverses both legs of a timed-out peer transfer', async () => {
      txRepo.find.mockResolvedValue([
        makeTx('tx-t', {
          senderId: 'sender-1',
          receiverId: 'receiver-1',
          fee: 0,
          metadata: {},
        }),
      ]);

      await svc.reconcilePendingTransactions();

      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'sender-1',
        'USD',
        100,
        manager,
      );
      expect(wallets.adjustBalance).toHaveBeenCalledWith(
        'receiver-1',
        'USD',
        -100,
        manager,
      );
    });

    it('does not credit anything back for a timed-out deposit', async () => {
      txRepo.find.mockResolvedValue([
        makeTx('tx-d', { metadata: { type: 'deposit' } }),
      ]);

      await svc.reconcilePendingTransactions();

      expect(wallets.adjustBalance).not.toHaveBeenCalled();
      const saved = manager.save.mock.calls[0][1] as Transaction;
      expect(saved.status).toBe(TransactionStatus.FAILED);
      expect(saved.metadata.autoFailRefundedAt).toBeUndefined();
    });

    it('records an auditable refund entry', async () => {
      txRepo.find.mockResolvedValue([makeTx('tx-w')]);

      await svc.reconcilePendingTransactions();

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'transaction.auto_failed_refunded',
          entityType: 'transaction',
          entityId: 'tx-w',
          userId: 'user-1',
        }),
      );
    });

    it('leaves the transaction PENDING when the reversal fails', async () => {
      txRepo.find.mockResolvedValue([makeTx('tx-w')]);
      wallets.adjustBalance.mockRejectedValue(
        new BadRequestException('Insufficient balance'),
      );

      await svc.reconcilePendingTransactions();

      const tx = (await txRepo.find.mock.results[0].value)[0] as Transaction;
      expect(tx.status).toBe(TransactionStatus.PENDING);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('does not refund twice when a transaction is picked up again', async () => {
      txRepo.find.mockResolvedValue([
        makeTx('tx-w', {
          metadata: {
            type: 'withdrawal',
            autoFailRefundedAt: new Date().toISOString(),
          },
        }),
      ]);

      await svc.reconcilePendingTransactions();

      expect(wallets.adjustBalance).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('leaves an unrecognised transaction shape PENDING for manual review', async () => {
      txRepo.find.mockResolvedValue([
        makeTx('tx-x', {
          senderId: 'user-1',
          receiverId: 'user-1',
          metadata: {},
        }),
      ]);

      await svc.reconcilePendingTransactions();

      expect(wallets.adjustBalance).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
    });
  });
});
