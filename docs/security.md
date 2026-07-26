# JWT Secret Rotation

## Strategy

The app supports dual-secret JWT verification to allow zero-downtime secret rotation.

- `JWT_SECRET` — the current signing secret (required)
- `JWT_SECRET_PREVIOUS` — the previous secret, accepted during the overlap window (optional)

## How It Works

1. Token verification tries `JWT_SECRET` first.
2. If verification fails and `JWT_SECRET_PREVIOUS` is set, it retries with the previous secret.
3. Tokens verified via the previous secret are transparently re-issued using `JWT_SECRET` and returned in the `X-Refreshed-Token` response header.

## Rotation Procedure

1. Set `JWT_SECRET_PREVIOUS` to the current value of `JWT_SECRET`.
2. Generate a new secret and set it as `JWT_SECRET`.
3. Deploy. Existing sessions continue to work via `JWT_SECRET_PREVIOUS`.
4. After your session TTL has elapsed (all old tokens expired), remove `JWT_SECRET_PREVIOUS`.
5. Deploy again to complete the rotation.

---

# WALLET_ENCRYPTION_KEY Rotation

## Overview

All wallet secret keys are encrypted with AES-256-GCM. Each encrypted value stores a `keyVersion`
so multiple key versions can coexist during a rotation window, enabling zero-downtime re-keying.

## Key Configuration

| Environment variable | Description |
|---|---|
| `WALLET_ENCRYPTION_KEY` | Hex-encoded 32-byte primary key (required) |
| `WALLET_ENCRYPTION_KEY_VERSION` | Integer version for the primary key (default: `1`) |
| `WALLET_ENCRYPTION_KEY_V2` … `_V10` | Additional historic key versions kept for decryption |

Example — adding a new key as version 2 while keeping version 1 for backward compatibility:

```
WALLET_ENCRYPTION_KEY=<new-32-byte-hex>
WALLET_ENCRYPTION_KEY_VERSION=2
WALLET_ENCRYPTION_KEY_V1=<old-32-byte-hex>
```

## Rotation Procedure

1. **Generate** a new 32-byte key: `openssl rand -hex 32`
2. **Shift** the current key to a versioned variable, e.g. `WALLET_ENCRYPTION_KEY_V1=<current-key>`.
3. **Set** the new key: `WALLET_ENCRYPTION_KEY=<new-key>` and `WALLET_ENCRYPTION_KEY_VERSION=2`.
4. **Deploy** — the service can now decrypt records encrypted with any loaded version.
5. **Re-encrypt** all wallets via the admin endpoint:
   ```
   POST /api/v1/admin/system/rotate-encryption-key
   Authorization: Bearer <admin-jwt>
   ```
   The response reports `{ total, rotated, skipped }`. The operation is **idempotent** — safe to
   re-run if interrupted.
6. **Verify** — confirm `skipped === total` (all records now use the latest key version).
7. **Remove** old key variables and redeploy to complete the rotation.

## Notes

- Rotation progress is logged per-wallet at INFO level with `KeyRotationService`.
- The endpoint requires `JwtAuthGuard + AdminRoleGuard + IpAllowlistGuard`.
- Each `WalletBalanceEntity` row carries a `keyVersion` column that tracks which key encrypted it.
