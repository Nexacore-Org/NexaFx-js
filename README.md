# NexaFx-js

NexaFx-js is a high-performance NestJS enterprise platform supporting FX rates, multi-currency wallets, double-entry ledger bookkeeping, compliance, and Stellar blockchain transactions.

## Features

- **Multi-Currency Wallets**: Manage wallet balances with threshold-based auto-sweeping.
- **FX Rates & Conversions**: Real-time exchange rate failover with locked preview quotes.
- **Double-Entry Ledger**: Immutable transaction recording and balance reconciliation.
- **Compliance & Security**: Integrated KYC/AML, IP allowlisting, and JWT authentication.
- **Metrics & Observability**: OpenTelemetry tracing and Prometheus metrics exposition.

## Prerequisites

- **Node.js**: `>=20.0.0`
- **Docker & Docker Compose**
- **PostgreSQL 14+**
- **Redis 7+**

## Feature Flags

Each flag is controlled by its `FEATURE_*` environment variable (`true` enables it; unset or anything else disables it). The effective values are logged at startup and exposed by `GET /feature-flags`. Disabled routes return `404`.

| Flag | Gates |
| --- | --- |
| `FEATURE_FX_TRADING` | FX trade execution/reversal and locked FX quote previews |
| `FEATURE_REFERRALS` | Referral codes, stats and reward endpoints |
| `FEATURE_BLOCKCHAIN` | Stellar write endpoints (federation address create/delete) |
| `FEATURE_TWO_FA` | Two-factor OTP setup/verification flow |
| `FEATURE_PUSH_NOTIFICATIONS` | Device registration/deregistration and all push delivery (sends are skipped with a warning when off) |

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in required variables:

```bash
cp .env.example .env
```

### 3. Running Locally

```bash
# Development mode
npm run start:dev

# Production build
npm run build
npm run start:prod
```

### 4. Running Tests & Linting

```bash
# Unit tests
npm test

# Type checking
npx tsc --noEmit

# Linter
npm run lint

# Check dependency wildcards
npm run check:no-wildcard-deps
```

### 5. Docker Deployment

```bash
docker-compose up --build
```
