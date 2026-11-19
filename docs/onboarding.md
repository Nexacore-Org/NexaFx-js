# Onboarding

## Local development setup

1. Copy `.env.example` to `.env` and fill required values.
2. Start local services:
   - `docker compose up db`
   - (optional) `docker compose up redis` for queues/sockets
3. Install dependencies and run migrations as needed:
   - `npm ci --ignore-scripts`
   - `npm run migration:run`

`docker compose up db` starts Postgres and runs `scripts/db/init-test-db.sql` to create the disposable `nexafx_test` database used by integration specs.

## Integration tests (Postgres)

Integration specs use `src/test/test-database.module.ts` (`TEST_DB_*` env vars, `_test`/`-test` database name required, schema dropped/recreated).

Run locally:

```bash
docker compose up db
TEST_DB_HOST=localhost TEST_DB_PORT=5432 TEST_DB_USERNAME=postgres TEST_DB_PASSWORD=postgres TEST_DB_DATABASE=nexafx_test npm run test:integration -- --runInBand
```

CI runs the same suite in a dedicated job with a `postgres:16` service container.

## Onboarding state machine

### States
1. **unverified** — user registered, email not verified
2. **email_verified** — email confirmed, can access basic features
3. **kyc_submitted** — KYC documents uploaded, pending review
4. **kyc_approved** — KYC approved, full platform access

### Transitions
- Register → **unverified**
- Verify email → **email_verified**
- Submit KYC → **kyc_submitted**
- Admin approves KYC → **kyc_approved**

### Guard Protection
The `OnboardingGuard` blocks unverified users from financial endpoints (deposit, withdrawal, swap).
