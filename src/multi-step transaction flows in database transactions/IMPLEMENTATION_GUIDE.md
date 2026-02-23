# Implementation Guide

## Overview

This guide walks you through implementing the transaction management solution in your existing NestJS application.

## Step 1: Install Dependencies

Ensure you have TypeORM installed:

```bash
npm install @nestjs/typeorm typeorm
```

## Step 2: Import Modules

Update your `app.module.ts`:

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
      type: "postgres",
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      username: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      autoLoadEntities: true,
      synchronize: false,
    }),
    CommonModule, // Must be imported first (it's global)
    TransactionsModule,
    SnapshotsModule,
    WebhooksModule,
    EnrichmentModule,
  ],
})
export class AppModule {}
```

## Step 3: Adapt Services to Your Schema

The provided services use raw SQL queries. You'll need to adapt them to match your database schema:

### Example: Adapting TransactionExecutionService

```typescript
// Original (generic)
private async createTransactionRecord(queryRunner: QueryRunner, data: any): Promise<any> {
  const result = await queryRunner.manager.query(
    `INSERT INTO transactions (idempotency_key, amount, status, created_at)
     VALUES ($1, $2, $3, NOW()) RETURNING *`,
    [data.idempotencyKey, data.amount, 'pending'],
  );
  return result[0];
}

// Adapted to your schema
private async createTransactionRecord(queryRunner: QueryRunner, data: any): Promise<any> {
  const result = await queryRunner.manager.query(
    `INSERT INTO your_transactions_table (
      idempotency_key,
      amount,
      from_account_id,
      to_account_id,
      status,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
    [
      data.idempotencyKey,
      data.amount,
      data.fromAccountId,
      data.toAccountId,
      'pending'
    ],
  );
  return result[0];
}
```

## Step 4: Using TypeORM Entities (Alternative)

If you prefer using TypeORM entities instead of raw SQL:

```typescript
import { Injectable } from "@nestjs/common";
import { TransactionService } from "../../common/services/transaction.service";
import { Transaction } from "../entities/transaction.entity";

@Injectable()
export class TransactionExecutionService {
  constructor(private transactionService: TransactionService) {}

  async executeTransaction(data: any): Promise<Transaction> {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Check idempotency
      const existing = await queryRunner.manager.findOne(Transaction, {
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;

      // Create transaction
      const transaction = queryRunner.manager.create(Transaction, {
        idempotencyKey: data.idempotencyKey,
        amount: data.amount,
        status: "pending",
      });
      await queryRunner.manager.save(transaction);

      // Update balances
      await queryRunner.manager.decrement(
        Account,
        { id: data.fromAccountId },
        "balance",
        data.amount,
      );
      await queryRunner.manager.increment(
        Account,
        { id: data.toAccountId },
        "balance",
        data.amount,
      );

      // Create audit log
      const auditLog = queryRunner.manager.create(AuditLog, {
        transactionId: transaction.id,
        action: "transaction_executed",
      });
      await queryRunner.manager.save(auditLog);

      // Mark completed
      transaction.status = "completed";
      await queryRunner.manager.save(transaction);

      return transaction;
    });
  }
}
```

## Step 5: Add Database Migrations

Create migrations for any new columns needed:

```bash
npm run typeorm migration:create -- src/migrations/AddTransactionFields
```

Example migration:

```typescript
import { MigrationInterface, QueryRunner } from "typeorm";

export class AddTransactionFields1234567890 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions 
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS enrichment_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS enriched_data JSONB,
      ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMP
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_idempotency_key 
      ON transactions(idempotency_key)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE transactions 
      DROP COLUMN IF EXISTS idempotency_key,
      DROP COLUMN IF EXISTS retry_count,
      DROP COLUMN IF EXISTS enrichment_count,
      DROP COLUMN IF EXISTS enriched_data,
      DROP COLUMN IF EXISTS last_enriched_at
    `);
  }
}
```

## Step 6: Update Existing Services

Identify services with multi-step writes and update them:

### Before:

```typescript
@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Inventory) private inventoryRepo: Repository<Inventory>,
  ) {}

  async createOrder(data: CreateOrderDto) {
    const order = await this.orderRepo.save(data);
    await this.inventoryRepo.decrement(
      { id: data.productId },
      "stock",
      data.quantity,
    );
    return order;
  }
}
```

### After:

```typescript
@Injectable()
export class OrderService {
  constructor(private transactionService: TransactionService) {}

  async createOrder(data: CreateOrderDto) {
    return this.transactionService.runInTransaction(async (queryRunner) => {
      // Idempotency check
      const existing = await queryRunner.manager.findOne(Order, {
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;

      // Create order
      const order = queryRunner.manager.create(Order, data);
      await queryRunner.manager.save(order);

      // Update inventory
      await queryRunner.manager.decrement(
        Inventory,
        { id: data.productId },
        "stock",
        data.quantity,
      );

      return order;
    });
  }
}
```

## Step 7: Add Tests

Create tests for your adapted services:

```typescript
describe("OrderService Transaction Tests", () => {
  it("should rollback order creation if inventory update fails", async () => {
    const mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue({ id: "1" }),
        save: jest.fn().mockResolvedValue({ id: "1" }),
        decrement: jest.fn().mockRejectedValue(new Error("Insufficient stock")),
      },
    };

    jest
      .spyOn(dataSource, "createQueryRunner")
      .mockReturnValue(mockQueryRunner as any);

    await expect(orderService.createOrder(orderData)).rejects.toThrow(
      "Insufficient stock",
    );
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
  });
});
```

## Step 8: Configure Logging

Add logging to track transaction operations:

```typescript
import { Logger } from "@nestjs/common";

export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  async runInTransaction<T>(
    work: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    this.logger.log("Transaction started");

    try {
      const result = await work(queryRunner);
      await queryRunner.commitTransaction();
      this.logger.log("Transaction committed");
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Transaction rolled back: ${error.message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
```

## Step 9: Performance Considerations

### Keep Transactions Short

```typescript
// Bad: Long-running transaction
async processOrder(orderId: string) {
  return this.transactionService.runInTransaction(async (queryRunner) => {
    const order = await this.getOrder(queryRunner, orderId);
    await this.callExternalAPI(order); // External call in transaction!
    await this.updateOrder(queryRunner, order);
  });
}

// Good: Only database operations in transaction
async processOrder(orderId: string) {
  const order = await this.getOrder(orderId);
  const externalData = await this.callExternalAPI(order); // Outside transaction

  return this.transactionService.runInTransaction(async (queryRunner) => {
    await this.updateOrder(queryRunner, order, externalData);
  });
}
```

### Use Appropriate Isolation Levels

```typescript
async runInTransaction<T>(
  work: (queryRunner: QueryRunner) => Promise<T>,
  isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE',
): Promise<T> {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction(isolationLevel);
  // ... rest of implementation
}
```

## Step 10: Monitoring and Alerts

Add monitoring for transaction failures:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { DataSource, QueryRunner } from "typeorm";

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);
  private rollbackCount = 0;

  async runInTransaction<T>(
    work: (queryRunner: QueryRunner) => Promise<T>,
  ): Promise<T> {
    const startTime = Date.now();
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();
      const result = await work(queryRunner);
      await queryRunner.commitTransaction();

      const duration = Date.now() - startTime;
      this.logger.log(`Transaction completed in ${duration}ms`);

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.rollbackCount++;

      const duration = Date.now() - startTime;
      this.logger.error(
        `Transaction rolled back after ${duration}ms. Total rollbacks: ${this.rollbackCount}`,
      );

      // Alert if rollback rate is high
      if (this.rollbackCount > 100) {
        // Send alert to monitoring system
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
```

## Troubleshooting

### Issue: Deadlocks

**Solution**: Ensure consistent ordering of table access across transactions

### Issue: Long-running transactions

**Solution**: Move non-database operations outside transactions

### Issue: Connection pool exhaustion

**Solution**: Ensure `queryRunner.release()` is always called (use finally block)

### Issue: Idempotency key collisions

**Solution**: Use UUIDs or combine multiple fields for uniqueness

## Next Steps

1. Identify all multi-step write operations in your codebase
2. Prioritize critical flows (payments, orders, etc.)
3. Implement transaction wrapping incrementally
4. Add comprehensive tests
5. Monitor rollback rates in production
6. Optimize transaction duration
