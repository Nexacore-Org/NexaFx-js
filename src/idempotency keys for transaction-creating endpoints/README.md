# Idempotency Implementation for NestJS

## Setup

1. Import `IdempotencyModule` in your app module:

```typescript
import { IdempotencyModule } from "./idempotency/idempotency.module";

@Module({
  imports: [IdempotencyModule /* other modules */],
})
export class AppModule {}
```

2. Run the migration to create the idempotency table

3. Apply to controllers:

```typescript
@Controller("transactions")
@UseGuards(IdempotencyGuard)
@UseInterceptors(IdempotencyInterceptor)
export class TransactionsController {
  @Post()
  @Idempotent()
  async createTransaction(@Body() dto: CreateTransactionDto) {
    // Your logic
  }
}
```

## Usage

Clients must send `Idempotency-Key` header with unique value (e.g., UUID):

```bash
curl -X POST https://api.example.com/transactions \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100}'
```

## Features

- Prevents duplicate transactions
- Returns cached response for repeated requests
- Validates request consistency
- Auto-expires after 24 hours
- Works with transaction creation, transfers, deposits, withdrawals

## Cleanup

Schedule periodic cleanup of expired keys:

```typescript
@Cron('0 0 * * *') // Daily at midnight
async cleanupExpiredKeys() {
  await this.idempotencyService.cleanup();
}
```
