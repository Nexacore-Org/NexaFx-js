# Architecture

This repository is an enterprise NestJS financial technology platform organized into focused domain module groupings wired into `AppModule`:

- **Auth & Identity**: `AuthModule`, `UsersModule`, `SessionsModule`, `ApiKeysModule` providing global `JwtAuthGuard` JWT verification.
- **Payments, FX & Ledger**: `WalletsModule`, `FxModule`, `ExchangeRatesModule`, `LedgerModule`, `BulkPaymentsModule`, `FeeTiersModule`.
- **Compliance & Risk**: `AmlModule`, `KycModule`, `KycTiersModule`.
- **Infrastructure & Observability**: `ConfigModule`, `HealthModule`, `MetricsModule`, `QueuesModule`, `AuditModule`, `AppGraphQLModule`.

## Deferred modules

`AppModule` previously imported the module files below, none of which were ever committed to the
repository. The imports have been removed so the root module compiles; each name is recorded here as
deferred scope rather than as working functionality:

`AdminAuditModule`, `AnnouncementsModule`, `ComplianceModule`, `DataArchiveModule`,
`EnrichmentModule`, `EscrowModule`, `ExperimentsModule`, `FeatureFlagsModule`, `GoalsModule`,
`InsightsModule`, `InsightsForecastModule`, `ModulesCacheModule`, `RetryModule`, `RiskEngineModule`,
`ScheduledTransactionsModule`, `SecretsModule`, `StrategyOptimizerModule`,
`TransactionApprovalModule`, `TransactionRiskModule`, `VersioningModule`.

A further set of dangling imports duplicated modules that do exist under a different path, and were
dropped in favour of the real ones: `./modules/reconciliation` (use `ReconciliationModule` from
`src/reconciliation`), `./modules/mail` (`src/mail`), `./modules/wallets` (`src/wallet`) and
`./modules/referrals` (`src/referral`). `LedgerModule`, `KycModule` and `FxModule` were repointed at
their real locations under `src/ledger`, `src/kyc` and `src/fx`.

`npm run check:app-module-imports` (run in CI and on `prebuild`) fails the build if a relative
import in `src/app.module.ts` stops resolving to a file on disk.

## Removed dead code

- **`NotificationQueueModule`/`NotificationProcessor`** (`src/notification/`) — removed. The
  `@Process(NOTIFICATION_JOB_NAMES.DISPATCH)` handler was fully implemented, but a repo-wide
  search found zero producers ever calling `.add(NOTIFICATION_JOB_NAMES.DISPATCH, ...)` — the
  entire push path was unreachable. Wiring it up naively would have bypassed the user
  notification-preference checks that `NotificationBatchingService` already enforces on the real
  delivery path, so rather than duplicate/bypass that logic this dead consumer, its queue
  registration, and the `NOTIFICATION_JOB_NAMES` constant were removed instead.
  `PushNotificationService`/`PushModule` (used by `NotificationBatchingService` and
  `DevicesController`) and the `notification-queue` Bull queue monitored by
  `queue-monitor.controller.ts` (registered separately in `src/queues/queues.module.ts`) are
  unrelated and were left in place.
- **`BlockchainModule`/`BlockchainService`** (`src/blockchain/`) — removed. Its entire
  implementation was Ethereum JSON-RPC (`eth_getBalance`, `eth_getTransactionReceipt`,
  `eth_blockNumber`, `0x...` address validation), inconsistent with this platform's actual
  Stellar-based architecture, and it was never injected anywhere outside its own module.
  No multi-chain/Ethereum support is currently planned; `src/blockchain/qr/stellar-qr.service.ts`
  is unrelated to this module and was left in place.
- **`BackupCodesService`** (`src/auth/2fa/backup-codes.service.ts`) — removed. It compared
  2FA recovery codes as plaintext (`storedCodes: string[]`), unlike the bcrypt/HMAC hashing
  standard used elsewhere in `src/auth` and `src/otp`, and was imported into `auth.module.ts`
  but never registered as a provider or called from any controller. Backup-code-based account
  recovery isn't an actual planned feature right now; if it's added later it should hash codes
  the same way `OtpService.hmac()` does before this was removed, not compare them raw.

## Module dependency graph

```mermaid
flowchart TD
  AppModule["AppModule"] --> ConfigModule["ConfigModule"]
  AppModule --> TypeOrmModule["TypeOrmModule"]
  AppModule --> BullModule["BullModule"]
  AppModule --> AuthModule["AuthModule"]
  AppModule --> WalletsModule["WalletsModule"]
  AppModule --> FxModule["FxModule"]
  AppModule --> LedgerModule["LedgerModule"]
  AppModule --> MetricsModule["MetricsModule"]
  AppModule --> HealthModule["HealthModule"]
  AppModule --> AppGraphQLModule["AppGraphQLModule"]
```

## Authentication flow

Authentication is handled globally by `JwtAuthGuard` registered as an `APP_GUARD`. Requests without `@Public()` decorator require a valid Bearer JWT header.

```mermaid
flowchart LR
  Client["Client"] --> Api["API request"]
  Api --> JwtGuard["JwtAuthGuard (Global APP_GUARD)"]
  JwtGuard -->|Valid Token| UserContext["Authenticated User Context (req.user)"]
  JwtGuard -->|@Public() Decorator| PublicEndpoint["Public Controller Endpoint"]
  UserContext --> Controllers["Domain Controllers / GraphQL Resolvers"]
  Controllers --> Services["Domain Services"]
```

## Transaction lifecycle

Wallet balance changes and related ledger entries follow an atomic database transaction lifecycle:

```mermaid
sequenceDiagram
  participant Client
  participant WalletsController
  participant WalletsService
  participant LedgerService
  participant Database

  Client->>WalletsController: Adjust balance request
  WalletsController->>WalletsService: adjustBalance(...)
  WalletsService->>Database: Update wallet balance
  WalletsService->>LedgerService: recordEntry(...)
  LedgerService->>Database: Persist ledger credit/debit entry
  WalletsService-->>Client: Updated balance response
```

## Key design decisions

- **Global Authentication**: `JwtAuthGuard` enforces authentication across REST and GraphQL endpoints unless explicitly decorated with `@Public()`.
- **Idempotency first**: Replayable requests are cached so duplicate submissions reuse safe cached responses.
- **Double-Entry Bookkeeping**: Money-movement flows record dual ledger entries for complete auditability.
- **Failover Exchange Rates**: Dual provider failover with stale-rate fallback guarantees FX rate availability.
- **Container Observability**: Health indicators and Prometheus metrics export application state for orchestrators.
