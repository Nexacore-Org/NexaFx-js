import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { DistributedLockService } from '../common/locks/distributed-lock.service';
import { ScheduledJobsService } from './scheduled-jobs.service';
import {
  Transaction,
  TransactionStatus,
} from '../transactions/transaction.entity';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';

const makeConfig = (overrides: Record<string, unknown> = {}) =>
  ({
    get: jest.fn((k: string) => {
      const values: Record<string, unknown> = {
        'scheduledJobs.lockTtlMs': 300_000,
        'scheduledJobs.lockHeartbeatMs': 60_000,
        'scheduledJobs.reconcileBatchSize': 100,
        'scheduledJobs.reconcileTimeBudgetMs': 4 * 60 * 1000,
        'scheduledJobs.pendingTxTimeoutMinutes': 30,
        ...overrides,
      };
      return values[k];
    }),
  }) as unknown as ConfigService;

const makeTx = (
  id: string,
  overrides: Partial<Transaction> = {},
): Transaction =>
  ({
    id,
    senderId: 'user-1',
    receiverId: 'user-1',
    amount: 100,
    fee: 5,
    currency: 'USD',
    metadata: { type: 'withdrawal' },
    status: TransactionStatus.PENDING,
    pendingTimeoutAt: new Date(Date.now() - 60 * 60 * 1000),
    ...overrides,
  }) as Transaction;

class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number }>();

  set(
    key: string,
    value: string,
    px: 'PX',
    ttl: number,
    nx: 'NX',
  ): Promise<'OK' | null> {
    void px;
    void nx;
    if (this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
    return Promise.resolve('OK');
  }

  eval(
    script: string,
    count: number,
    key: string,
    token: string,
  ): Promise<number> {
    void script;
    void count;
    if (this.store.get(key)?.value !== token) return Promise.resolve(0);
    this.store.delete(key);
    return Promise.resolve(1);
  }
}

describe('ScheduledJobsService', () => {
  let txRepo: { createQueryBuilder: jest.Mock };
  let query: {
    where: jest.Mock;
    andWhere: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    getMany: jest.Mock;
  };
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let dataSource: DataSource;
  let wallets: { adjustBalance: jest.Mock };
  let audit: { log: jest.Mock };
  let events: { emit: jest.Mock };
  let locks: { runExclusive: jest.Mock };

  function makeService(
    config = makeConfig(),
    lockService: DistributedLockService | { runExclusive: jest.Mock } = locks,
  ) {
    return new ScheduledJobsService(
      txRepo as unknown as Repository<Transaction>,
      {} as Repository<never>,
      {} as Repository<never>,
      config,
      dataSource,
      wallets as unknown as WalletsService,
      audit as unknown as AuditService,
      events as unknown as EventEmitter2,
      lockService as DistributedLockService,
    );
  }

  function queueBatches(batches: Transaction[][]) {
    query.getMany.mockImplementation(() =>
      Promise.resolve(batches.shift() ?? []),
    );
  }

  beforeEach(() => {
    query = {
      where: jest.fn(),
      andWhere: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
      take: jest.fn(),
      getMany: jest.fn(),
    };
    query.where.mockReturnValue(query);
    query.andWhere.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.addOrderBy.mockReturnValue(query);
    query.take.mockReturnValue(query);
    txRepo = { createQueryBuilder: jest.fn().mockReturnValue(query) };

    manager = {
      findOne: jest.fn(() => Promise.resolve(makeTx('tx-1'))),
      save: jest.fn((entity: unknown, tx: Transaction) => {
        void entity;
        return Promise.resolve(tx);
      }),
    };
    dataSource = {
      transaction: jest.fn(async (run: (m: unknown) => Promise<unknown>) =>
        run(manager),
      ),
    } as unknown as DataSource;

    wallets = { adjustBalance: jest.fn().mockResolvedValue(undefined) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    events = { emit: jest.fn() };
    locks = {
      runExclusive: jest.fn(
        async (_key: string, _ttl: number, fn: () => unknown) => ({
          ran: true,
          result: await fn(),
        }),
      ),
    };
  });

  it('scans for overdue PENDING rows and skips when no row is timed out', async () => {
    queueBatches([]);
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(query.where).toHaveBeenCalledWith('tx.status = :status', {
      status: TransactionStatus.PENDING,
    });
    expect(locks.runExclusive).not.toHaveBeenCalled();
  });

  it('marks a timed-out PENDING transaction FAILED using the freshly locked row', async () => {
    const stale = makeTx('tx-1');
    queueBatches([[stale]]);
    manager.findOne.mockResolvedValue(makeTx('tx-1'));
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(locks.runExclusive).toHaveBeenCalledWith(
      'tx-processing:tx-1',
      300_000,
      expect.any(Function),
      { heartbeatMs: 60_000 },
    );
    expect(manager.findOne).toHaveBeenCalledWith(Transaction, {
      where: { id: 'tx-1' },
      lock: { mode: 'pessimistic_write' },
    });
    const saved = manager.save.mock.calls[0][1] as Transaction;
    expect(saved.id).toBe('tx-1');
    expect(saved.status).toBe(TransactionStatus.FAILED);
  });

  it('skips a transaction whose per-tx lock is held elsewhere', async () => {
    queueBatches([[makeTx('tx-2')]]);
    locks.runExclusive.mockResolvedValue({ ran: false });
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(manager.findOne).not.toHaveBeenCalled();
  });

  it('does nothing when the row was confirmed before the lock was acquired', async () => {
    queueBatches([[makeTx('tx-3')]]);
    manager.findOne.mockResolvedValue(
      makeTx('tx-3', { status: TransactionStatus.COMPLETED }),
    );
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(wallets.adjustBalance).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('does nothing when the deadline was extended before the lock was acquired', async () => {
    queueBatches([[makeTx('tx-4')]]);
    manager.findOne.mockResolvedValue(
      makeTx('tx-4', { pendingTimeoutAt: new Date(Date.now() + 60_000) }),
    );
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(manager.save).not.toHaveBeenCalled();
  });

  it('uses the fresh metadata, not the stale snapshot, for the double-refund guard', async () => {
    queueBatches([
      [
        makeTx('tx-5', {
          metadata: { type: 'withdrawal', autoFailRefundedAt: 'old' },
        }),
      ],
    ]);
    manager.findOne.mockResolvedValue(makeTx('tx-5'));
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(wallets.adjustBalance).toHaveBeenCalledWith(
      'user-1',
      'USD',
      105,
      manager,
      'tx-5',
    );
  });

  it('pages through overdue rows with seek-based batches', async () => {
    const first = Array.from({ length: 100 }, (_, i) =>
      makeTx(`tx-${i}`, {
        pendingTimeoutAt: new Date(Date.now() - 200_000 + i),
      }),
    );
    const second = Array.from({ length: 100 }, (_, i) =>
      makeTx(`tx-${100 + i}`, {
        pendingTimeoutAt: new Date(Date.now() - 100_000 + i),
      }),
    );
    const third = Array.from({ length: 50 }, (_, i) =>
      makeTx(`tx-${200 + i}`, {
        pendingTimeoutAt: new Date(Date.now() - 50_000 + i),
      }),
    );
    queueBatches([first, second, third]);
    manager.findOne.mockImplementation(
      (_entity: unknown, options: { where: { id: string } }) => {
        void _entity;
        return Promise.resolve(makeTx(options.where.id));
      },
    );
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(query.getMany).toHaveBeenCalledTimes(3);
    expect(locks.runExclusive).toHaveBeenCalledTimes(250);
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('tx.pendingTimeoutAt > :lastTimeout'),
      expect.objectContaining({ lastId: 'tx-99' }),
    );
  });

  it('does not scan when the time budget is already exhausted', async () => {
    queueBatches([[makeTx('tx-1')]]);
    const svc = makeService(
      makeConfig({ 'scheduledJobs.reconcileTimeBudgetMs': 0 }),
    );

    await svc.reconcilePendingTransactions();

    expect(query.getMany).not.toHaveBeenCalled();
  });

  it('reverses amount + fee for a timed-out withdrawal', async () => {
    queueBatches([[makeTx('tx-w')]]);
    manager.findOne.mockResolvedValue(makeTx('tx-w'));
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(wallets.adjustBalance).toHaveBeenCalledWith(
      'user-1',
      'USD',
      105,
      manager,
      'tx-w',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'transaction.auto_failed_refunded',
        entityId: 'tx-w',
      }),
    );
  });

  it('reverses both legs of a timed-out peer transfer', async () => {
    queueBatches([
      [
        makeTx('tx-t', {
          senderId: 'sender-1',
          receiverId: 'receiver-1',
          fee: 0,
          metadata: {},
        }),
      ],
    ]);
    manager.findOne.mockResolvedValue(
      makeTx('tx-t', {
        senderId: 'sender-1',
        receiverId: 'receiver-1',
        fee: 0,
        metadata: {},
      }),
    );
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(wallets.adjustBalance).toHaveBeenCalledWith(
      'sender-1',
      'USD',
      100,
      manager,
      'tx-t',
    );
    expect(wallets.adjustBalance).toHaveBeenCalledWith(
      'receiver-1',
      'USD',
      -100,
      manager,
      'tx-t',
    );
  });

  it('leaves the transaction PENDING when the reversal fails', async () => {
    queueBatches([[makeTx('tx-r')]]);
    manager.findOne.mockResolvedValue(makeTx('tx-r'));
    wallets.adjustBalance.mockRejectedValue(
      new BadRequestException('Insufficient balance'),
    );
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(manager.save).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('leaves an unrecognised transaction shape PENDING', async () => {
    queueBatches([
      [
        makeTx('tx-x', {
          senderId: 'user-1',
          receiverId: 'user-1',
          metadata: {},
        }),
      ],
    ]);
    manager.findOne.mockResolvedValue(
      makeTx('tx-x', {
        senderId: 'user-1',
        receiverId: 'user-1',
        metadata: {},
      }),
    );
    const svc = makeService();

    await svc.reconcilePendingTransactions();

    expect(manager.save).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('allows only one of two instances to refund the same transaction', async () => {
    const redis = new FakeRedis();
    const realLocks = new DistributedLockService(redis as any);
    queueBatches([[makeTx('tx-c')]]);
    const fresh = makeTx('tx-c');
    manager.findOne.mockImplementation(() => Promise.resolve(fresh));

    await Promise.all([
      makeService(makeConfig(), realLocks).reconcilePendingTransactions(),
      makeService(makeConfig(), realLocks).reconcilePendingTransactions(),
    ]);

    expect(wallets.adjustBalance).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(redis.store.size).toBe(0);
  });
});
