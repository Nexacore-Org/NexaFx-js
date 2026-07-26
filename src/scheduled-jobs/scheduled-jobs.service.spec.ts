import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { ScheduledJobsService } from './scheduled-jobs.service';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import Redis from 'ioredis';

const makeConfig = () =>
  ({
    get: jest.fn((k: string) => {
      if (k === 'scheduledJobs.lockTtlMs') return 300_000;
      if (k === 'scheduledJobs.pendingTxTimeoutMinutes') return 30;
      return undefined;
    }),
  } as unknown as ConfigService);

const makeTx = (id: string, overrides: Partial<Transaction> = {}): Transaction =>
  ({
    id,
    status: TransactionStatus.PENDING,
    pendingTimeoutAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
    ...overrides,
  } as Transaction);

describe('ScheduledJobsService', () => {
  let redis: jest.Mocked<Redis>;
  let txRepo: jest.Mocked<Repository<Transaction>>;
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

    svc = new ScheduledJobsService(redis, txRepo, makeConfig());
  });

  it('skips reconciliation when job lock cannot be acquired', async () => {
    redis.set.mockResolvedValueOnce(null); // lock not acquired

    await svc.reconcilePendingTransactions();

    expect(txRepo.find).not.toHaveBeenCalled();
  });

  it('sets timed-out PENDING transactions to FAILED', async () => {
    redis.set.mockResolvedValue('OK'); // all locks acquired
    const tx = makeTx('tx-1');
    txRepo.find.mockResolvedValue([tx]);

    await svc.reconcilePendingTransactions();

    const saved = (txRepo.save as jest.Mock).mock.calls[0][0] as Transaction;
    expect(saved.id).toBe('tx-1');
    expect(saved.status).toBe(TransactionStatus.FAILED);
  });

  it('skips a transaction already being processed (duplicate lock)', async () => {
    // first set = job-level lock acquired, second set = tx-level lock NOT acquired
    redis.set
      .mockResolvedValueOnce('OK')   // job lock
      .mockResolvedValueOnce(null);  // tx lock already held

    txRepo.find.mockResolvedValue([makeTx('tx-2')]);

    await svc.reconcilePendingTransactions();

    expect(txRepo.save).not.toHaveBeenCalled();
  });

  it('releases job lock after processing', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockResolvedValue([]);

    await svc.reconcilePendingTransactions();

    expect(redis.del).toHaveBeenCalledWith('lock:scheduled-job:reconcile-pending-txs');
  });

  it('releases job lock even when an error is thrown mid-run', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockRejectedValue(new Error('db error'));

    await expect(svc.reconcilePendingTransactions()).rejects.toThrow('db error');

    expect(redis.del).toHaveBeenCalledWith('lock:scheduled-job:reconcile-pending-txs');
  });

  it('releases per-tx lock after updating status', async () => {
    redis.set.mockResolvedValue('OK');
    txRepo.find.mockResolvedValue([makeTx('tx-3')]);

    await svc.reconcilePendingTransactions();

    expect(redis.del).toHaveBeenCalledWith('lock:tx-processing:tx-3');
  });
});
