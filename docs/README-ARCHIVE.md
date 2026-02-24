# Data Archival Feature

## Overview

This feature archives historical data into cold storage tables under the `archive` schema to reduce primary table size and query pressure.

Current scope:
- `transactions`
- `transaction_execution_snapshots`
- `transaction_risks`
- `api_usage_logs`

Archival is implemented as:
- Scheduled batch archival job
- Admin-only archive query endpoints
- Admin-only explicit restore endpoints

## Archive Storage Strategy

- Cold storage is implemented in the same Postgres database under schema `archive`.
- Rows are copied into archive tables as JSON payload (`data`), then deleted from hot tables.
- Tables created by migration:
  - `archive.transactions_archive`
  - `archive.transaction_execution_snapshots_archive`
  - `archive.transaction_risks_archive`
  - `archive.api_usage_logs_archive`

Migration file:
- `src/database/migrations/20260224000000-create-data-archive-schema.ts`

## Environment Variables

Add these variables to your environment:

```env
ARCHIVE_ENABLED=true
ARCHIVE_THRESHOLD_MONTHS=12
ARCHIVE_BATCH_SIZE=500
ARCHIVE_CRON=0 3 * * *
```

Notes:
- `ARCHIVE_ENABLED`: enables/disables scheduled archival worker.
- `ARCHIVE_THRESHOLD_MONTHS`: records older than this are eligible for archival.
- `ARCHIVE_BATCH_SIZE`: rows processed per batch.
- `ARCHIVE_CRON`: cron expression for the scheduled archival run.

## Admin Endpoints

Base path: `/admin/archive`

Authentication/authorization:
- Guarded with `JwtAuthGuard` + `AdminGuard`.

### Transactions

- `GET /admin/archive/transactions`
  - Query archived transactions with pagination/filtering.
  - Query params: `page`, `limit`, `status`, `currency`, `q`, `from`, `to`, `sortOrder`.

- `GET /admin/archive/transactions/:id`
  - Returns archived transaction by original transaction ID.
  - Includes archived snapshots and risk records linked to that transaction.

- `POST /admin/archive/transactions/:id/restore`
  - Restores archived transaction into primary tables.
  - Also restores related archived risk/snapshot rows.

### API Usage Logs

- `GET /admin/archive/api-usage-logs`
  - Query archived API usage logs.
  - Query params: `page`, `limit`, `route`, `method`, `statusCode`, `from`, `to`.

- `POST /admin/archive/api-usage-logs/:id/restore`
  - Restores a specific archived API usage log row to primary storage.

### Manual Run

- `POST /admin/archive/run`
  - Manually triggers archival job.

## Scheduling

Worker:
- `src/modules/data-archive/workers/data-archive.worker.ts`

Service:
- `src/modules/data-archive/services/data-archive.service.ts`

Cron behavior:
- Runs on `ARCHIVE_CRON`.
- Skips execution when `ARCHIVE_ENABLED=false`.
- Logs counts for archived transactions, snapshots, risks, and API logs.

## Testing

Focused tests are available under:
- `src/modules/data-archive/services/data-archive.service.spec.ts`
- `src/modules/data-archive/controllers/data-archive-admin.controller.spec.ts`

Run feature tests:

```bash
pnpm test -- data-archive
```
