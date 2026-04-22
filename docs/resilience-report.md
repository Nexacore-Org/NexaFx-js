# Resilience Report — NexaFx

Generated: 2026-04-22

## Overview

This document describes the chaos testing scenarios implemented for NexaFx and the expected system behaviour under each failure condition.

## Chaos Test Scenarios

### 1. Redis Failure (`test/chaos/redis-failure.chaos-spec.ts`)

**Scenario**: Redis cache becomes unavailable mid-operation.

**Expected behaviour**:
- Balance queries fall through to PostgreSQL — no 500 errors
- Application continues serving all non-cache-dependent endpoints
- Cache write failures are silently swallowed (non-critical path)

**How to run**: `CHAOS=true npx jest test/chaos/redis-failure.chaos-spec.ts`

---

### 2. DB Connection Pool Exhaustion (`test/chaos/db-pool-exhaustion.chaos-spec.ts`)

**Scenario**: 20 concurrent requests exhaust the DB connection pool.

**Expected behaviour**:
- Requests queue at the pool level — no unhandled exceptions
- Responses may be slow (503) but never crash the process
- Pool recovers automatically when connections are released

**How to run**: `CHAOS=true npx jest test/chaos/db-pool-exhaustion.chaos-spec.ts`

---

### 3. External FX Provider Outage (`test/chaos/provider-outage.chaos-spec.ts`)

**Scenario**: All FX rate providers return errors simultaneously.

**Expected behaviour**:
- Circuit breakers open for all providers
- FX quote endpoint returns 503 (not 200 with stale data)
- Health endpoint continues responding
- Admin alert emitted via `circuit-breaker.opened` event

**How to run**: `CHAOS=true npx jest test/chaos/provider-outage.chaos-spec.ts`

---

### 4. Webhook Endpoint Unavailable (`test/chaos/webhook-unavailable.chaos-spec.ts`)

**Scenario**: All outbound webhook deliveries fail for an extended period.

**Expected behaviour**:
- Transaction creation succeeds — webhook failure does not block the response
- Failed webhooks enter the retry queue (BullMQ)
- After max retries, jobs move to the Dead Letter Queue
- No unhandled promise rejections or process crashes

**How to run**: `CHAOS=true npx jest test/chaos/webhook-unavailable.chaos-spec.ts`

---

## Running All Chaos Tests

```bash
CHAOS=true npx jest test/chaos/ --config test/jest-e2e.json --forceExit
```

> **Note**: Chaos tests do NOT run in CI by default. Set `CHAOS=true` explicitly to enable them.

## Cleanup Guarantee

Every chaos test restores normal conditions in `afterAll()` — no test leaves the system in a degraded state.
