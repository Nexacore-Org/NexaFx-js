# Transaction Lifecycle (Event-Driven)

Transaction processing uses an **event-driven architecture**. Domain events are emitted only **after** the corresponding database transaction has committed, so listeners never see uncommitted data.

> **Verified**: The full event chain is covered by `test/transaction-event-chain.e2e-spec.ts` (unit/integration) and `test/transaction-load.e2e-spec.ts` (100 concurrent transactions). See issue #470.

## Verified Event Sequence Diagram

The following sequence has been verified by `test/transaction-event-chain.e2e-spec.ts`:

```
Client
  │
  ▼
TransactionLifecycleService.create()
  │  [DB transaction commits]
  │── emit TRANSACTION_CREATED ──────────────┬──────────────────────────────────────────┐
  │                                          ▼                                          ▼
  │                               TransactionWebhookListener           (no snapshot on create)
  │                                  └─ WebhookDispatcherService.dispatch()
  │
  ▼
TransactionLifecycleService.markProcessing()   (optional)
  │  [DB transaction commits]
  └── emit TRANSACTION_PROCESSING ────────── TransactionWebhookListener
                                               └─ WebhookDispatcherService.dispatch()

TransactionLifecycleService.markCompleted()
  │  [DB transaction commits]
  └── emit TRANSACTION_COMPLETED ─────────────┬────────────────────────────────────────┐
                                              ▼                                        ▼
                                 TransactionWebhookListener          TransactionSnapshotListener
                                  └─ WebhookDispatcherService          └─ TransactionSnapshotService
                                       .dispatch()                          .createSnapshot()
                                       (HMAC-signed)                        (status: SUCCESS)

TransactionLifecycleService.markFailed()
  │  [DB transaction commits]
  └── emit TRANSACTION_FAILED ──────────────┬─────────────────────────────┬────────────┐
                                            ▼                             ▼            ▼
                               TransactionWebhookListener  TransactionSnapshotListener  TransactionRetryListener
                                └─ WebhookDispatcherService  └─ createSnapshot()        └─ RetryService.createJob()
                                     .dispatch()                 (status: FAILED)            (only when retryable=true)
                                     (HMAC-signed)
```

## Domain Events

| Event                    | When emitted                        | Payload highlights                           |
|--------------------------|-------------------------------------|----------------------------------------------|
| `transaction.created`    | After transaction row is committed  | `transactionId`, `amount`, `currency`, `timestamp` |
| `transaction.processing` | After status is set to processing   | `transactionId`, `startedAt`, `timestamp`    |
| `transaction.completed`  | After status is set to SUCCESS      | `transactionId`, `completedAt`, `durationMs` |
| `transaction.failed`     | After status is set to FAILED       | `transactionId`, `errorMessage`, `retryable` |

All events include `transactionId` and `timestamp`. Events are fired only after the DB transaction commits.

## Listeners

| Listener | Module | Handles | Action |
|---|---|---|---|
| `TransactionWebhookListener` | webhooks | all 4 events | `WebhookDispatcherService.dispatch(eventName, payload)` — HMAC-signed |
| `TransactionSnapshotListener` | transactions | `completed`, `failed` | `TransactionSnapshotService.createSnapshot(...)` |
| `TransactionRetryListener` | retry | `failed` (retryable=true only) | `RetryService.createJob(type='transfer.retry', ...)` |

## Verified Behaviours (see test/transaction-event-chain.e2e-spec.ts)

- `TRANSACTION_CREATED` event triggers webhook dispatch immediately after commit
- `TRANSACTION_COMPLETED` triggers both webhook dispatch AND snapshot creation
- `TRANSACTION_FAILED` with `retryable=true` creates a retry job in `RetryService`
- `TRANSACTION_FAILED` with `retryable=false` does **not** create a retry job
- Webhooks carry the correct event name for each lifecycle transition
- Snapshot is created for both `COMPLETED` and `FAILED` transitions
- 100 concurrent transactions complete without event-chain failures (see test/transaction-load.e2e-spec.ts)

## Usage

Use `TransactionLifecycleService` to drive the lifecycle; do not call webhooks, retry, or snapshot services directly from transaction code.

```ts
// Create (emits TRANSACTION_CREATED after commit)
const tx = await this.transactionLifecycleService.create({
  amount: 100,
  currency: 'USD',
  description: 'Transfer',
  metadata: { from: 'a', to: 'b' },
});

// Optional: mark processing (emits TRANSACTION_PROCESSING)
await this.transactionLifecycleService.markProcessing(tx.id);

try {
  // … do work …
  await this.transactionLifecycleService.markCompleted(tx.id, { durationMs: 50 });
} catch (e) {
  await this.transactionLifecycleService.markFailed(tx.id, {
    message: e.message,
    retryable: true,
  });
}
```

Webhook dispatch, snapshot creation, and retry scheduling happen asynchronously via the event listeners after each commit.

## Configuration

- **EventEmitterModule** is registered in `AppModule` with `EventEmitterModule.forRoot({ ... })`.
- Event names are defined in `src/modules/transactions/events/transaction.events.ts`.

## Testing

- **Integration (event chain)**: `test/transaction-event-chain.e2e-spec.ts` verifies the full listener chain end-to-end using a mocked DataSource.
- **Load test**: `test/transaction-load.e2e-spec.ts` verifies 100 concurrent transactions complete without event-chain failures.
- **Unit**: `transaction-lifecycle.service.spec.ts` verifies that each lifecycle method emits the correct event after the (mocked) transaction commits, and that the event sequence (e.g. created → processing → completed) is correct.
