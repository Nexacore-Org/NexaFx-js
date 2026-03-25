# Security Audit — Endpoint Coverage

All endpoints below are covered by `test/security.e2e-spec.ts`.

## Public Endpoints (no auth required)

| Method | Path                  | Expected |
|--------|-----------------------|----------|
| GET    | /maintenance/status   | 200      |

## Protected Endpoints

| Method | Path                | Guard(s)                        | 401 | 403 (wrong role) | 200 (correct role)  |
|--------|---------------------|---------------------------------|-----|------------------|---------------------|
| PUT    | /maintenance/config | JwtAuthGuard + Roles(admin, superadmin) | ✓ | ✓ (user role)   | ✓ (admin, superadmin) |
| GET    | /users              | JwtAuthGuard                    | ✓   | n/a              | ✓ (any role)        |
| DELETE | /users/:id          | JwtAuthGuard + Roles(superadmin)| ✓   | ✓ (user, admin)  | ✓ (superadmin)      |
| POST   | /simulation/run     | JwtAuthGuard + SandboxInterceptor | ✓ | n/a              | ✓ (any role)        |

## SandboxInterceptor Behaviour

When `x-sandbox-mode: true` header is present, the interceptor short-circuits
and returns `{ sandbox: true, message: "..." }` without executing the handler.
Verified in `POST /simulation/run` sandbox test case.

## CI Integration

Add to your CI pipeline:

```yaml
- name: Run security E2E tests
  run: npm run test:e2e
```

This runs on every PR via `test/jest-e2e.json` configuration.
