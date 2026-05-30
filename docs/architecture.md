# Architecture

This repository is a NestJS application organized around a small set of focused modules:

- `ConfigModule` validates and structures runtime configuration.
- `IdempotencyModule` deduplicates replayable requests and stores cached responses.
- `WalletsModule` manages in-memory balance updates.
- `ActivityFeedModule` stores and serves audit-style activity records.

## Module dependency graph

```mermaid
flowchart LR
  AppModule["AppModule"] --> ConfigModule["ConfigModule"]
  AppModule --> TypeOrmModule["TypeOrmModule"]
  AppModule --> BullModule["BullModule"]
  AppModule --> IdempotencyModule["IdempotencyModule"]
  AppModule --> WalletsModule["WalletsModule"]
  WalletsModule --> ActivityFeedModule["ActivityFeedModule"]
  IdempotencyModule --> TypeOrmModule
  IdempotencyModule --> ScheduleModule["ScheduleModule"]
  ActivityFeedModule --> TypeOrmModule
```

## Authentication flow

The repository currently does not ship a full auth module, but the expected request flow is:

```mermaid
flowchart LR
  Client["Client"] --> Api["API request"]
  Api --> JwtGuard["Auth guard / JWT validation"]
  JwtGuard --> UserContext["Authenticated user context"]
  UserContext --> Controllers["Controllers"]
  Controllers --> Services["Services"]
```

## Transaction lifecycle

Wallet balance changes and related activity events follow the same general lifecycle:

```mermaid
sequenceDiagram
  participant Client
  participant WalletsController
  participant WalletsService
  participant ActivityFeedService
  participant Database

  Client->>WalletsController: Adjust balance request
  WalletsController->>WalletsService: adjustBalance(...)
  WalletsService->>Database: Update balance state
  WalletsService->>ActivityFeedService: recordActivity(...)
  ActivityFeedService->>Database: Persist activity event
  WalletsService-->>Client: Updated balance
```

## Key design decisions

- **Idempotency first**: replayable requests are cached so duplicate submissions can reuse a safe response.
- **Event-driven hooks**: balance changes emit activity records so the feed stays in sync with business events.
- **Structured feed items**: the activity feed returns consistent fields (`timestamp`, `type`, `description`, `ipAddress`, `deviceInfo`, `securityEvent`) for UI rendering.
- **Configuration validation**: environment values are validated at startup to fail fast on bad deployment settings.
- **Modular boundaries**: each domain area stays in its own Nest module to keep growth manageable.
