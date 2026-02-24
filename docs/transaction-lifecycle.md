# Transaction Lifecycle (Event-Driven)

Transaction processing uses an **event-driven architecture**. Domain events are emitted only **after** the corresponding database transaction has committed, so listeners never see uncommitted data.

## Event flow

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                  TransactionLifecycleService            │
                    │  (runs in DB transaction, then emits after commit)      │
                    └─────────────────────────────────────────────────────────┘
                                                     │
     ┌──────────────────────────────────────────────┼──────────────────────────────────────────────┐
     │                                              │                                              │
     ▼                                              ▼                                              ▼
┌─────────────┐                            ┌─────────────────┐                            ┌─────────────────┐
│ TRANSACTION │                            │ TRANSACTION     │                            │ TRANSACTION     │
│ _CREATED    │                            │ _PROCESSING     │                            │ _COMPLETED /    │
│             │                            │                 │                            │ _FAILED         │
└──────┬──────┘                            └────────┬────────┘                            └────────┬────────┘
       │                                                    │                                              │
       │         ┌─────────────────────────────────────────┼─────────────────────────────────────────┐   │
       │         │                                         │                                         │   │
       ▼         ▼                                         ▼                                         ▼   ▼
┌───────────────┐  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ Webhook       │  │ Webhook            │  │ Webhook            │  │ Snapshot           │  │ Retry (failed only)│
│ dispatch      │  │ dispatch           │  │ dispatch           │  │ creation           │  │ job scheduling     │
│ (created)     │  │ (processing)       │  │ (completed/failed) │  │ (completed/failed) │  │                    │
└───────────────┘  └────────────────────┘  └────────────────────┘  └────────────────────┘  └────────────────────┘
```

## Domain events

| Event                   | When emitted                         | Payload highlights                          |
|-------------------------|--------------------------------------|---------------------------------------------|
| `transaction.created`   | After transaction row is committed   | `transactionId`, `amount`, `currency`, …   |
| `transaction.processing`| After status is set to processing   | `transactionId`, `startedAt`                |
| `transaction.completed` | After status is set to SUCCESS      | `transactionId`, `completedAt`, `durationMs`|
| `transaction.failed`   | After status is set to FAILED       | `transactionId`, `errorMessage`, `retryable`|

All events include `transactionId` and `timestamp`. Events are fired only after the DB transaction commits.

## Listeners

- **TransactionWebhookListener** (webhooks module): On each event, calls `WebhookDispatcherService.dispatch(eventName, payload)` so subscribers receive webhooks for `transaction.created`, `transaction.processing`, `transaction.completed`, `transaction.failed`.
- **TransactionSnapshotListener** (transactions module): On `transaction.completed` and `transaction.failed`, creates a `TransactionExecutionSnapshotEntity` for audit/replay.
- **TransactionRetryListener** (retry module): On `transaction.failed` when `retryable === true`, schedules a retry job via `RetryService.createJob(...)`.

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

- **Unit/integration**: `transaction-lifecycle.service.spec.ts` verifies that each lifecycle method emits the correct event after the (mocked) transaction commits, and that the event sequence (e.g. created → processing → completed) is correct.
