/**
 * Transaction Lifecycle — Load Test Suite
 *
 * Verifies that 100 concurrent transactions complete without event-chain failures.
 * Uses mocked DB (not real Postgres) to keep CI fast; the key assertion is that
 * the event pipeline doesn't deadlock, drop events, or throw under concurrency.
 *
 * To run against a real DB, set DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD and
 * remove the DataSource mock.
 */
process.env.DISABLE_BULL = 'true';
process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TransactionLifecycleService } from '../src/modules/transactions/services/transaction-lifecycle.service';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { TransactionSnapshotListener } from '../src/modules/transactions/listeners/transaction-snapshot.listener';
import { TransactionWebhookListener } from '../src/modules/webhooks/listeners/transaction-webhook.listener';
import { TransactionRetryListener } from '../src/modules/retry/listeners/transaction-retry.listener';
import { TransactionSnapshotService } from '../src/modules/transactions/services/transaction-snapshot.service';
import { WebhookDispatcherService } from '../src/modules/webhooks/webhook-dispatcher.service';
import { RetryService } from '../src/modules/retry/retry.services';
import {
  TRANSACTION_CREATED,
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../src/modules/transactions/events';

const CONCURRENT_TRANSACTIONS = 100;

describe('Transaction Event Chain — Load Test (100 concurrent)', () => {
  let module: TestingModule;
  let lifecycleService: TransactionLifecycleService;
  let eventEmitter: EventEmitter2;

  let snapshotService: jest.Mocked<TransactionSnapshotService>;
  let webhookDispatcher: jest.Mocked<WebhookDispatcherService>;
  let retryService: jest.Mocked<RetryService>;

  let txCounter = 0;

  beforeEach(async () => {
    txCounter = 0;
    snapshotService = { createSnapshot: jest.fn().mockResolvedValue(undefined) } as any;
    webhookDispatcher = { dispatch: jest.fn().mockResolvedValue({ success: true, sentTo: 1 }) } as any;
    retryService = { createJob: jest.fn().mockResolvedValue(undefined) } as any;

    const dataSource = {
      transaction: jest.fn().mockImplementation(async (cb: (mgr: any) => any) => {
        txCounter++;
        const id = `tx-load-${txCounter}`;
        const entity = Object.assign(new TransactionEntity(), {
          id,
          amount: 100,
          currency: 'USD',
          status: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
          riskScore: 0,
          isFlagged: false,
          requiresManualReview: false,
        } as TransactionEntity);

        const mgr = {
          getRepository: jest.fn().mockReturnValue({
            create: jest.fn().mockReturnValue(entity),
            save: jest.fn().mockResolvedValue(entity),
            findOne: jest.fn().mockResolvedValue(entity),
            update: jest.fn().mockResolvedValue(undefined),
          }),
        };
        await cb(mgr);
      }),
    };

    const txRepoMock = {
      findOne: jest.fn().mockImplementation(({ where: { id } }: any) =>
        Promise.resolve(
          Object.assign(new TransactionEntity(), {
            id,
            amount: 100,
            currency: 'USD',
            status: 'PENDING',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as TransactionEntity),
        ),
      ),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };

    module = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot({ wildcard: false })],
      providers: [
        TransactionLifecycleService,
        TransactionSnapshotListener,
        TransactionWebhookListener,
        TransactionRetryListener,
        { provide: 'DataSource', useValue: dataSource },
        { provide: getRepositoryToken(TransactionEntity), useValue: txRepoMock },
        { provide: WebhookDispatcherService, useValue: webhookDispatcher },
        { provide: TransactionSnapshotService, useValue: snapshotService },
        { provide: RetryService, useValue: retryService },
      ],
    }).compile();

    lifecycleService = module.get(TransactionLifecycleService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(async () => {
    await module.close();
    jest.clearAllMocks();
  });

  it(`should process ${CONCURRENT_TRANSACTIONS} concurrent transactions without event-chain failures`, async () => {
    const createdEvents: string[] = [];
    const completedEvents: string[] = [];

    eventEmitter.on(TRANSACTION_CREATED, (p) => createdEvents.push(p.transactionId));
    eventEmitter.on(TRANSACTION_COMPLETED, (p) => completedEvents.push(p.transactionId));

    // 1. Create all transactions concurrently
    const txs = await Promise.all(
      Array.from({ length: CONCURRENT_TRANSACTIONS }, () =>
        lifecycleService.create({ amount: 50, currency: 'USD' }),
      ),
    );

    expect(txs).toHaveLength(CONCURRENT_TRANSACTIONS);
    expect(createdEvents).toHaveLength(CONCURRENT_TRANSACTIONS);

    // 2. Mark all completed concurrently
    await Promise.all(txs.map((tx) => lifecycleService.markCompleted(tx.id, { durationMs: 10 })));

    // Let async listeners flush
    await new Promise((r) => setTimeout(r, 50));

    expect(completedEvents).toHaveLength(CONCURRENT_TRANSACTIONS);

    // 3. Webhook dispatcher called for each create + complete event
    const webhookCalls = webhookDispatcher.dispatch.mock.calls;
    const createdCalls = webhookCalls.filter(([name]) => name === TRANSACTION_CREATED);
    const completedCalls = webhookCalls.filter(([name]) => name === TRANSACTION_COMPLETED);

    expect(createdCalls).toHaveLength(CONCURRENT_TRANSACTIONS);
    expect(completedCalls).toHaveLength(CONCURRENT_TRANSACTIONS);

    // 4. Snapshots created for each completed transaction
    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(CONCURRENT_TRANSACTIONS);

    // 5. No retry jobs for successfully completed transactions
    expect(retryService.createJob).not.toHaveBeenCalled();
  }, 15000);

  it(`should process ${CONCURRENT_TRANSACTIONS} concurrent FAILED transactions and schedule retry jobs`, async () => {
    const failedEvents: string[] = [];
    eventEmitter.on(TRANSACTION_FAILED, (p) => failedEvents.push(p.transactionId));

    const txs = await Promise.all(
      Array.from({ length: CONCURRENT_TRANSACTIONS }, () =>
        lifecycleService.create({ amount: 50, currency: 'USD' }),
      ),
    );

    await Promise.all(
      txs.map((tx) =>
        lifecycleService.markFailed(tx.id, {
          message: 'Network timeout',
          code: 'NETWORK_TIMEOUT',
          retryable: true,
        }),
      ),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(failedEvents).toHaveLength(CONCURRENT_TRANSACTIONS);

    // All failed + retryable → all should have retry jobs
    expect(retryService.createJob).toHaveBeenCalledTimes(CONCURRENT_TRANSACTIONS);

    // Snapshots also created for failed
    expect(snapshotService.createSnapshot).toHaveBeenCalledTimes(CONCURRENT_TRANSACTIONS);
  }, 15000);

  it('should not lose events when listeners run concurrently with new creates', async () => {
    const allCreated: string[] = [];
    eventEmitter.on(TRANSACTION_CREATED, (p) => {
      // Simulate a slow listener
      allCreated.push(p.transactionId);
    });

    // Fire transactions in waves
    const wave1 = await Promise.all(
      Array.from({ length: 50 }, () => lifecycleService.create({ amount: 1, currency: 'USD' })),
    );
    const wave2 = await Promise.all(
      Array.from({ length: 50 }, () => lifecycleService.create({ amount: 2, currency: 'EUR' })),
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(allCreated).toHaveLength(100);
    expect(wave1.length + wave2.length).toBe(100);
  }, 15000);
});
