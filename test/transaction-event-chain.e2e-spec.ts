/**
 * Transaction Lifecycle Event Chain — Integration Test Suite
 *
 * Verifies that the full event chain works end-to-end:
 *   TransactionLifecycleService → EventEmitter2 → Listeners
 *     → WebhookDispatcher, SnapshotService, RetryService
 *
 * All database/external dependencies are mocked so the suite runs without
 * a real Postgres or Redis instance (NODE_ENV=test, DISABLE_BULL=true).
 */
process.env.DISABLE_BULL = 'true';
process.env.NODE_ENV = 'test';

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TransactionLifecycleService } from '../src/modules/transactions/services/transaction-lifecycle.service';
import { TransactionEntity } from '../src/modules/transactions/entities/transaction.entity';
import { TransactionSnapshotListener } from '../src/modules/transactions/listeners/transaction-snapshot.listener';
import { TransactionSnapshotService } from '../src/modules/transactions/services/transaction-snapshot.service';
import { TransactionWebhookListener } from '../src/modules/webhooks/listeners/transaction-webhook.listener';
import { WebhookDispatcherService } from '../src/modules/webhooks/webhook-dispatcher.service';
import { TransactionRetryListener } from '../src/modules/retry/listeners/transaction-retry.listener';
import { RetryService } from '../src/modules/retry/retry.services';
import {
  TRANSACTION_CREATED,
  TRANSACTION_COMPLETED,
  TRANSACTION_FAILED,
} from '../src/modules/transactions/events';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeTxEntity(overrides: Partial<TransactionEntity> = {}): TransactionEntity {
  return Object.assign(new TransactionEntity(), {
    id: 'tx-001',
    amount: 100,
    currency: 'USD',
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    riskScore: 0,
    isFlagged: false,
    requiresManualReview: false,
    ...overrides,
  } as TransactionEntity);
}

function makeDataSource(savedEntity: TransactionEntity) {
  return {
    transaction: jest.fn().mockImplementation(async (cb: (mgr: any) => any) => {
      const mgr = {
        getRepository: jest.fn().mockReturnValue({
          create: jest.fn().mockReturnValue(savedEntity),
          save: jest.fn().mockResolvedValue(savedEntity),
          findOne: jest.fn().mockResolvedValue(savedEntity),
          update: jest.fn().mockResolvedValue(undefined),
        }),
      };
      await cb(mgr);
    }),
  };
}

// ─── Test Suite ────────────────────────────────────────────────────────────

describe('Transaction Event Chain (integration)', () => {
  let module: TestingModule;
  let lifecycleService: TransactionLifecycleService;
  let eventEmitter: EventEmitter2;

  // Spy targets
  let webhookDispatcher: jest.Mocked<WebhookDispatcherService>;
  let snapshotService: jest.Mocked<TransactionSnapshotService>;
  let retryService: jest.Mocked<RetryService>;

  beforeEach(async () => {
    const txEntity = makeTxEntity();
    const dataSource = makeDataSource(txEntity);

    webhookDispatcher = { dispatch: jest.fn().mockResolvedValue({ success: true, sentTo: 1 }) } as any;
    snapshotService = { createSnapshot: jest.fn().mockResolvedValue(undefined) } as any;
    retryService = { createJob: jest.fn().mockResolvedValue(undefined) } as any;

    const txRepoMock = {
      create: jest.fn().mockReturnValue(txEntity),
      save: jest.fn().mockResolvedValue(txEntity),
      findOne: jest.fn().mockResolvedValue(txEntity),
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

  // ── Test 1: POST /transactions → CREATED event → webhook dispatched ──────

  it('should emit TRANSACTION_CREATED and dispatch webhook', async () => {
    const createdSpy = jest.fn();
    eventEmitter.on(TRANSACTION_CREATED, createdSpy);

    await lifecycleService.create({ amount: 200, currency: 'USD' });

    expect(createdSpy).toHaveBeenCalledTimes(1);
    expect(createdSpy).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-001', amount: 200, currency: 'USD' }),
    );

    // Give async listeners a chance to run
    await new Promise((r) => setImmediate(r));

    expect(webhookDispatcher.dispatch).toHaveBeenCalledWith(
      TRANSACTION_CREATED,
      expect.objectContaining({ transactionId: 'tx-001' }),
    );
  });

  // ── Test 2: COMPLETED → snapshot AND webhook dispatched ──────────────────

  it('should emit TRANSACTION_COMPLETED, create snapshot AND dispatch webhook', async () => {
    const completedSpy = jest.fn();
    eventEmitter.on(TRANSACTION_COMPLETED, completedSpy);

    await lifecycleService.markCompleted('tx-001', { durationMs: 42 });

    expect(completedSpy).toHaveBeenCalledTimes(1);
    expect(completedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-001', durationMs: 42 }),
    );

    await new Promise((r) => setImmediate(r));

    // Both snapshot and webhook must fire
    expect(snapshotService.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-001', status: 'SUCCESS' }),
    );
    expect(webhookDispatcher.dispatch).toHaveBeenCalledWith(
      TRANSACTION_COMPLETED,
      expect.objectContaining({ transactionId: 'tx-001' }),
    );
  });

  // ── Test 3: FAILED with retryable=true → retry job created ───────────────

  it('should schedule retry job when transaction fails with retryable=true', async () => {
    const failedSpy = jest.fn();
    eventEmitter.on(TRANSACTION_FAILED, failedSpy);

    await lifecycleService.markFailed('tx-001', {
      message: 'Network timeout',
      code: 'NETWORK_TIMEOUT',
      retryable: true,
    });

    expect(failedSpy).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-001', retryable: true }),
    );

    await new Promise((r) => setImmediate(r));

    expect(retryService.createJob).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'tx-001', type: 'transfer.retry' }),
    );
  });

  // ── Test 4: FAILED with retryable=false → NO retry job ───────────────────

  it('should NOT schedule retry job when retryable=false', async () => {
    await lifecycleService.markFailed('tx-001', {
      message: 'Insufficient funds',
      code: 'INSUFFICIENT_FUNDS',
      retryable: false,
    });

    await new Promise((r) => setImmediate(r));

    expect(retryService.createJob).not.toHaveBeenCalled();
  });

  // ── Test 5: Webhook HMAC signature present ───────────────────────────────

  it('webhook dispatch is called with correct event name for each lifecycle transition', async () => {
    await lifecycleService.create({ amount: 50, currency: 'EUR' });
    await new Promise((r) => setImmediate(r));
    expect(webhookDispatcher.dispatch).toHaveBeenCalledWith(
      TRANSACTION_CREATED,
      expect.any(Object),
    );

    webhookDispatcher.dispatch.mockClear();
    await lifecycleService.markCompleted('tx-001');
    await new Promise((r) => setImmediate(r));
    expect(webhookDispatcher.dispatch).toHaveBeenCalledWith(
      TRANSACTION_COMPLETED,
      expect.any(Object),
    );
  });

  // ── Test 6: Events carry correct payload structure ────────────────────────

  it('TRANSACTION_CREATED payload includes amount, currency, timestamp, transactionId', async () => {
    const payloads: any[] = [];
    eventEmitter.on(TRANSACTION_CREATED, (p) => payloads.push(p));

    await lifecycleService.create({ amount: 999, currency: 'GBP', metadata: { ref: 'abc' } });

    expect(payloads[0]).toMatchObject({
      transactionId: expect.any(String),
      amount: 999,
      currency: 'GBP',
      timestamp: expect.any(Date),
      metadata: { ref: 'abc' },
    });
  });

  // ── Test 7: COMPLETED event does NOT trigger retry ────────────────────────

  it('should NOT schedule a retry job for completed transactions', async () => {
    await lifecycleService.markCompleted('tx-001', { durationMs: 10 });
    await new Promise((r) => setImmediate(r));
    expect(retryService.createJob).not.toHaveBeenCalled();
  });

  // ── Test 8: Snapshot created for FAILED transactions ─────────────────────

  it('should create snapshot for FAILED transactions', async () => {
    await lifecycleService.markFailed('tx-001', {
      message: 'Provider error',
      code: 'PROVIDER_ERROR',
      retryable: false,
    });
    await new Promise((r) => setImmediate(r));

    expect(snapshotService.createSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ transactionId: 'tx-001', status: 'FAILED' }),
    );
  });
});
