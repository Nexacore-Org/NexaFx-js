# Database Transaction Management Solution

This solution implements robust database transaction management for NestJS applications using TypeORM, addressing the issue of multi-step writes that can cause partial writes and corrupted state.

## Features

- **Atomic Transactions**: All multi-step operations wrapped in database transactions
- **Automatic Rollback**: Failed operations automatically rollback all changes
- **Idempotency**: Duplicate operations are detected and handled gracefully
- **Comprehensive Testing**: Integration tests for rollback behavior
- **Clean Architecture**: Reusable transaction service for all flows

## Implemented Flows

### 1. Transaction Execution

- Creates transaction records
- Updates account balances
- Creates audit logs
- Marks transactions as completed
- All wrapped in a single database transaction

### 2. Retry Jobs

- Creates retry job records
- Updates transaction retry counts
- Logs retry attempts
- Processes retry jobs with rollback on failure

### 3. Snapshot Management

- Creates snapshots with versioning
- Archives old snapshots
- Updates entity references
- Restores from snapshots atomically

### 4. Webhook Dispatch

- Creates dispatch logs
- Updates event status
- Records dispatch attempts
- Handles webhook responses with retry scheduling

### 5. Transaction Enrichment

- Adds enrichment data to transactions
- Updates enrichment metadata
- Logs enrichment operations
- Prevents duplicate enrichments

## Usage

### Basic Transaction Pattern

```typescript
import { Injectable } from "@nestjs/common";
import { TransactionService } from "./common/services/transaction.service";

@Injectable()
export class YourService {
  constructor(private transactionService: TransactionService) {}

  async yourMethod() {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Step 1: First database operation
      await queryRunner.manager.query("INSERT INTO ...");

      // Step 2: Second database operation
      await queryRunner.manager.query("UPDATE ...");

      // Step 3: Third database operation
      await queryRunner.manager.query("INSERT INTO ...");

      // All steps commit together or rollback on any failure
    });
  }
}
```

### Idempotency Pattern

```typescript
async createRecord(data: any) {
  return this.transactionService.runInTransaction(async (queryRunner) => {
    // Check if already exists
    const existing = await queryRunner.manager.query(
      'SELECT * FROM table WHERE idempotency_key = $1',
      [data.idempotencyKey]
    );

    if (existing[0]) {
      return existing[0]; // Return existing record
    }

    // Create new record
    const result = await queryRunner.manager.query(
      'INSERT INTO table (...) VALUES (...) RETURNING *',
      [...]
    );

    return result[0];
  });
}
```

## Module Setup

Add the modules to your `app.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CommonModule } from "./common/common.module";
import { TransactionsModule } from "./transactions/transactions.module";
import { SnapshotsModule } from "./snapshots/snapshots.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { EnrichmentModule } from "./enrichment/enrichment.module";

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // your database config
    }),
    CommonModule,
    TransactionsModule,
    SnapshotsModule,
    WebhooksModule,
    EnrichmentModule,
  ],
})
export class AppModule {}
```

## Testing

Run the integration tests:

```bash
npm test test/integration/transaction-rollback.spec.ts
```

The tests verify:

- Rollback behavior on failures
- No partial records created
- Idempotency checks work correctly
- All multi-step flows are atomic

## Key Benefits

1. **Data Integrity**: No partial writes or corrupted state
2. **Reliability**: Automatic rollback on any step failure
3. **Idempotency**: Safe to retry operations
4. **Testability**: Comprehensive test coverage
5. **Maintainability**: Clean, reusable patterns

## Transaction Service API

### `runInTransaction<T>(work: (queryRunner: QueryRunner) => Promise<T>): Promise<T>`

Executes the provided work function within a database transaction.

- **Parameters**:
  - `work`: Async function that receives a QueryRunner
- **Returns**: Result of the work function
- **Behavior**:
  - Starts transaction
  - Executes work
  - Commits on success
  - Rolls back on error
  - Always releases connection

## Best Practices

1. **Always use transactions for multi-step writes**
2. **Implement idempotency checks at the start**
3. **Keep transactions short and focused**
4. **Use meaningful error messages**
5. **Log important operations**
6. **Test rollback scenarios**

## Migration from Existing Code

To migrate existing code:

1. Inject `TransactionService` into your service
2. Wrap multi-step operations in `runInTransaction`
3. Replace direct repository calls with `queryRunner.manager.query`
4. Add idempotency checks
5. Add tests for rollback behavior

## Example Migration

Before:

```typescript
async createOrder(data: any) {
  const order = await this.orderRepo.save(data);
  await this.inventoryRepo.update(data.productId, { stock: -1 });
  await this.auditRepo.save({ action: 'order_created' });
  return order;
}
```

After:

```typescript
async createOrder(data: any) {
  return this.transactionService.runInTransaction(async (queryRunner) => {
    const existing = await queryRunner.manager.query(
      'SELECT * FROM orders WHERE idempotency_key = $1',
      [data.idempotencyKey]
    );
    if (existing[0]) return existing[0];

    const order = await queryRunner.manager.query(
      'INSERT INTO orders (...) VALUES (...) RETURNING *',
      [...]
    );

    await queryRunner.manager.query(
      'UPDATE inventory SET stock = stock - 1 WHERE product_id = $1',
      [data.productId]
    );

    await queryRunner.manager.query(
      'INSERT INTO audit_logs (...) VALUES (...)',
      [...]
    );

    return order[0];
  });
}
```

## Support

For issues or questions, refer to the TypeORM transaction documentation:
https://typeorm.io/transactions
