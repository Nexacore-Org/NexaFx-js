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

---

# GraphQL Access Model

`UserType` exposes `email`, `firstName`, `lastName`, `isActive` and `kycStatus`.
KYC status is compliance-sensitive, so authentication alone does not grant
access to another user's record.

- `me` — self-service profile lookup. The id comes from the verified token; no
  argument is accepted.
- `user(id)` — admin tooling, plus the caller's own record. A caller whose `sub`
  does not match `id` and who holds neither `role: "admin"` nor `"admin"` in
  `roles` is rejected with 403.

New resolvers that return user-scoped data follow the same rule: derive the
subject from the request context, and require the admin role for anything
broader.
# Endpoint Authentication and Ownership

## Principal binding

Routes that act on a single user's data take the user from the verified JWT
(`req.user.sub`), never from the request body, query string, or a path
parameter. A `userId` sent by the caller is ignored:

- `POST /api/v1/kyc/submit` — the submission is always filed for the caller.
- `POST /api/v1/kyc/:id/appeal` — the document must belong to the caller.
- `GET /api/v1/kyc/:userId/expiry-status` — rejected with 403 unless `:userId`
  is the caller, matching the pattern used by `GET /statements/:userId`.
- `POST /api/v1/devices/register` — the push token is bound to the caller.
- `DELETE /api/v1/devices/:token` — the delete is scoped to the caller's own
  device tokens.
- `GET /transactions/:id/receipt` — the caller must be the sender or receiver of
  the transaction, otherwise 403 (404 when the transaction does not exist).

## Back-office routes

`POST /api/v1/referrals/:id/qualify` and `POST /api/v1/referrals/:id/reward`
credit a real wallet balance, so they require `JwtAuthGuard` plus
`AdminRoleGuard`. A referrer cannot qualify or reward their own referral.

## SEP-10 Stellar wallet login

Challenge signatures are Ed25519 and are verified with Node's one-shot
`crypto.verify(null, message, key, signature)` API over the raw challenge bytes.
Ed25519 hashes internally, so the challenge must not be pre-hashed, and the
streaming `crypto.createVerify()` API must not be used — it does not support
Ed25519 keys. Public keys are accepted as Stellar StrKey addresses (`G...`,
checksum-validated) or as a base64-encoded raw 32-byte key.
