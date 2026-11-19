# Database Index Strategy

Every index named here exists in an entity `@Index(...)` **and** in a migration; `src/database/index-docs.spec.ts`
fails if a Transaction or AuditLog row below stops being true. New indexes are created with
`CREATE INDEX CONCURRENTLY IF NOT EXISTS` in a migration with `transaction = false`.

## Transaction

| Index | Columns | Rationale |
|-------|---------|-----------|
| Composite | `(senderId, createdAt)` | Transaction history per user ordered by date |
| Composite | `(senderId, status)` | Filter transactions by user and execution status |
| Composite | `(status, createdAt)` | Job processor queue — pending transactions by age |
| Composite | `(currency, createdAt)` | AML structuring window queries by currency |
| Single | `senderId` | Lookup all transactions sent by a user |
| Single | `receiverId` | Lookup all transactions received by a user |
| Single | `createdAt` | System-wide chronological ordering and audit range queries |
| Single | `txHash` | Stellar blockchain transaction hash verification lookup |
| Unique | `reference` | Idempotency — prevent duplicate transactions |
| Unique | `receiptNumber` | Immutable payment receipt tracking and lookup |

## WalletBalance

| Index | Columns | Rationale |
|-------|---------|-----------|
| Unique composite | `(accountId, currency)` | Every balance lookup — one row per account+currency |

> `isPrimary` and `keyVersion` are **not** indexed: both are low-cardinality columns that are only read after the
> `(accountId, currency)` lookup (or scanned in full by the key-rotation job, where an index would not help). The earlier
> version of this document listed them, but no entity or migration ever created them (issue #1544).

## AuditLog

| Index | Columns | Rationale |
|-------|---------|-----------|
| Composite | `(userId, createdAt)` | Audit trail per user ordered by time |
| Composite | `(entityType, entityId)` | Lookup all audit events for a specific entity |
| Composite | `(action, createdAt)` | Filter security audit logs by action and timestamp |

## IdempotencyKey

| Index | Columns | Rationale |
|-------|---------|-----------|
| Single | `expiresAt` | Cleanup job — find and delete expired keys |
| Single | `createdAt` | Chronological idempotency key creation tracking |