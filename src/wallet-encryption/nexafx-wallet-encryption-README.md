# Issue #282 — Wallet Encryption at Rest, Private Key Management & Secure Key Rotation

## Files Delivered

```
src/
├── modules/
│   └── wallets/
│       ├── entities/
│       │   └── wallet.entity.ts               ← added privateKeyEncrypted + keyVersion columns
│       ├── services/
│       │   ├── wallet-encryption.service.ts   ← AES-256-GCM encrypt / decrypt / reEncrypt
│       │   └── wallet.service.ts              ← encrypt on create/update; strip from responses
│       ├── dto/
│       │   ├── create-wallet.dto.ts           ← accepts plaintext key (never persisted)
│       │   └── wallet-response.dto.ts         ← @Exclude() omits all key fields
│       ├── jobs/
│       │   └── key-rotation.job.ts            ← atomic, restartable key rotation + audit log
│       ├── wallet.controller.ts               ← ClassSerializerInterceptor applied globally
│       ├── wallets.module.ts                  ← full NestJS module wiring
│       └── wallet.service.spec.ts             ← security unit tests (5 suites, 25+ cases)
├── database/
│   └── migrations/
│       └── 1700000000000-encrypt-wallet-keys.ts  ← migrates existing plain-text keys
└── common/
    └── interceptors/
        └── private-key-redaction.interceptor.ts  ← last-line-of-defence HTTP layer filter
```

---

## Architecture Decisions

### Encryption (AES-256-GCM)
- Node's built-in `crypto` module — no third-party dependency.
- **16-byte random IV** generated fresh via `crypto.randomBytes` on every `encrypt()` call.
- Auth tag (16 bytes) is prepended to the ciphertext in the payload half, so decryption can detect tampering.
- **Wire format:** `base64(iv) + ':' + base64(authTag || ciphertext)` — safe for TEXT/VARCHAR columns.

### Key never leaks
Three independent layers:

| Layer | Mechanism |
|---|---|
| **DTO** | `WalletResponseDto` uses `@Exclude()` — `plainToInstance` only maps `@Expose()` fields |
| **Controller** | `@UseInterceptors(ClassSerializerInterceptor)` enforces the DTO at HTTP level |
| **Interceptor** | `PrivateKeyRedactionInterceptor` strips any `privateKey*` field from every response body as a final safety net |

Logger calls never include any key value — only wallet `id` and `keyVersion` are logged.

### Key Rotation (`KeyRotationJob`)
- **Atomic per wallet**: each re-encryption runs in its own DB transaction so a mid-run crash leaves no wallet half-rotated.
- **Restartable**: wallets are filtered by `keyVersion = targetVersion - 1`, so already-rotated wallets are skipped on re-run.
- **Audit trail**: a record is written to `audit_logs` after the batch completes.
- **Partial failure tolerance**: per-wallet failures are counted and logged; they don't abort the batch.

### Migration
- Reads `WALLET_ENCRYPTION_KEY` at run-time from `process.env`.
- Skips rows that already contain `:` (already encrypted).
- Processes in batches of 100 to avoid memory pressure on large tables.
- `down()` is intentionally a no-op (decrypting back to plain text would re-introduce the vulnerability).

---

## How to Register Globally

In `AppModule`:

```typescript
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PrivateKeyRedactionInterceptor } from './common/interceptors/private-key-redaction.interceptor';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: PrivateKeyRedactionInterceptor,
    },
  ],
})
export class AppModule {}
```

---

## Run Tests

```bash
npx jest src/modules/wallets/wallet.service.spec.ts --verbose
```

## Run Migration

```bash
WALLET_ENCRYPTION_KEY=<64-hex-chars> npm run typeorm migration:run
```

## Trigger Key Rotation

```bash
curl -X POST /wallets/admin/rotate-keys \
  -H 'Content-Type: application/json' \
  -d '{"oldKeyHex":"<old-64-hex>","targetVersion":2}'
```
