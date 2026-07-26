# Database Index Strategy

## Transaction

| Index | Columns | Rationale |
|-------|---------|-----------|
| Composite | `(senderId, createdAt)` | Transaction history per user ordered by date |
| Composite | `(status, createdAt)` | Job processor queue — pending transactions by age |
| Composite | `(currency, createdAt)` | AML structuring window queries by currency |
| Single | `senderId` | Lookup all transactions sent by a user |
| Single | `receiverId` | Lookup all transactions received by a user |
| Unique | `reference` | Idempotency — prevent duplicate transactions |

## WalletBalance

| Index | Columns | Rationale |
|-------|---------|-----------|
| Unique composite | `(accountId, currency)` | Every balance lookup — one row per account+currency |

## AuditLog

| Index | Columns | Rationale |
|-------|---------|-----------|
| Composite | `(userId, createdAt)` | Audit trail per user ordered by time |
| Composite | `(entityType, entityId)` | Lookup all audit events for a specific entity |

## IdempotencyKey

| Index | Columns | Rationale |
|-------|---------|-----------|
| Single | `expiresAt` | Cleanup job — find and delete expired keys |