# Security Audit — NexaFx API

Generated: 2026-04-22

## Summary

All protected endpoints enforce JWT authentication and role-based access control.
This document lists every endpoint, its required auth level, and test coverage status.

## Endpoint Security Matrix

| Endpoint | Method | Auth Required | Role | Test Coverage |
|---|---|---|---|---|
| /health | GET | None (public) | — | ✅ |
| /maintenance/status | GET | None (public) | — | ✅ |
| /maintenance/enable | POST | JWT | admin | ✅ |
| /maintenance/disable | POST | JWT | admin | ✅ |
| /maintenance/config | PUT | JWT | admin | ✅ |
| /auth/register | POST | None (public) | — | ✅ |
| /auth/login | POST | None (public) | — | ✅ |
| /transactions | POST | JWT | user | ✅ |
| /transactions/search | GET | JWT | user | ✅ |
| /transactions/bulk | POST | JWT | user | ✅ |
| /transactions/bulk-export | POST | JWT | user | ✅ |
| /admin/transactions/bulk-status-update | POST | JWT | admin | ✅ |
| /wallets/portfolio | GET | JWT | user | ✅ |
| /wallets/:id/balance | GET | JWT | user | ✅ |
| /admin/wallets/rotate-keys | POST | JWT | admin | ✅ |
| /deposits/bank | POST | JWT | user | ✅ |
| /withdrawals/bank | POST | JWT | user | ✅ |
| /bank-accounts | POST | JWT | user | ✅ |
| /admin/banking/unreconciled | GET | JWT | admin | ✅ |
| /admin/banking/force-settle/:id | POST | JWT | admin | ✅ |
| /fx/convert | POST | JWT | user | ✅ |
| /fx/convert/quote | GET | JWT | user | ✅ |
| /escrow | POST | JWT | user | ✅ |
| /escrow/:id/dispute | POST | JWT | user | ✅ |
| /admin/escrow/:id/resolve | POST | JWT | admin | ✅ |
| /subscriptions/:id/usage | GET | JWT | user | ✅ |
| /admin/subscriptions/usage-analytics | GET | JWT | admin | ✅ |
| /admin/notifications/throttles | GET | JWT | admin | ✅ |
| /admin/notification-templates | GET/POST/PATCH/DELETE | JWT | admin | ✅ |
| /users/me/push-token | POST/DELETE | JWT | user | ✅ |
| /users/me/phone-verification/send | POST | JWT | user | ✅ |
| /admin/analytics/notifications/delivery | GET | JWT | admin | ✅ |
| /goals/templates | GET | JWT | user | ✅ |
| /goals/challenges | GET | JWT | user | ✅ |
| /goals/challenges/:id/join | POST | JWT | user | ✅ |
| /goals/challenges/:id/leaderboard | GET | JWT | user | ✅ |
| /banking/webhooks/payment-rail | POST | None (public, HMAC verified) | — | ✅ |

## Known Issues Fixed in This Release

- **SandboxInterceptor**: Missing `of` import from RxJS — fixed in `src/simulation/simulation.service.ts`
- **PUT /maintenance/config**: `@Roles('admin', 'superadmin')` guard was commented out — restored with `AdminGuard`
- **POST /maintenance/enable** and **POST /maintenance/disable**: Guards were commented out — restored

## Guard Coverage Rules

1. Every non-public endpoint must have `@UseGuards(JwtAuthGuard)` or equivalent
2. Admin endpoints must additionally have `@UseGuards(AdminGuard)`
3. Financial state-creating endpoints must have `@Idempotent()` + `@UseGuards(IdempotencyGuard)`
4. Public endpoints must be explicitly marked with `@Public()` decorator

## CI

Security tests run on every PR via `.github/workflows/security-tests.yml`.
