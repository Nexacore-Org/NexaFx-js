import { MigrationInterface, QueryRunner } from 'typeorm';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const BATCH_SIZE = 100;

/**
 * Migration: Encrypt existing plain-text private keys
 * ─────────────────────────────────────────────────────
 * • Reads WALLET_ENCRYPTION_KEY from process.env at run-time (not build-time).
 * • Processes wallets in batches of BATCH_SIZE to avoid memory pressure.
 * • Already-encrypted rows (containing ':') are skipped safely.
 * • Each wallet is updated individually so a crash mid-run is restartable.
 *
 * Run with:  npm run typeorm migration:run
 */
export class EncryptWalletKeys1700000000000 implements MigrationInterface {
  name = 'EncryptWalletKeys1700000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const hexKey = process.env.WALLET_ENCRYPTION_KEY;

    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        '[Migration] WALLET_ENCRYPTION_KEY must be a 64-char hex string. Aborting.',
      );
    }

    const key = Buffer.from(hexKey, 'hex');

    // Ensure the column exists and can hold encrypted data
    await queryRunner.query(
      `ALTER TABLE wallets
       ALTER COLUMN private_key_encrypted TYPE TEXT`,
    );

    // Add key_version column if it doesn't exist yet
    const columnExists = await queryRunner.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'wallets' AND column_name = 'key_version'
    `);

    if (columnExists.length === 0) {
      await queryRunner.query(
        `ALTER TABLE wallets ADD COLUMN key_version INTEGER NOT NULL DEFAULT 1`,
      );
    }

    let offset = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const rows: Array<{ id: string; private_key_encrypted: string }> =
        await queryRunner.query(
          `SELECT id, private_key_encrypted
           FROM wallets
           ORDER BY id
           LIMIT $1 OFFSET $2`,
          [BATCH_SIZE, offset],
        );

      if (rows.length === 0) break;

      for (const row of rows) {
        const raw = row.private_key_encrypted;

        // Skip rows that are already in our encrypted format (contain ':')
        if (raw && raw.includes(':')) {
          console.log(`[Migration] Skipping already-encrypted wallet id=${row.id}`);
          continue;
        }

        if (!raw || raw.trim() === '') {
          console.warn(`[Migration] Wallet id=${row.id} has empty key — skipping.`);
          continue;
        }

        try {
          const encrypted = encryptWithKey(raw, key);
          await queryRunner.query(
            `UPDATE wallets
             SET private_key_encrypted = $1, key_version = 1
             WHERE id = $2`,
            [encrypted, row.id],
          );
        } catch {
          // Don't log the raw key — just the wallet id
          console.error(
            `[Migration] ERROR encrypting wallet id=${row.id} — skipping.`,
          );
        }
      }

      offset += BATCH_SIZE;
    }

    console.log('[Migration] EncryptWalletKeys — complete.');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    /**
     * Intentionally left non-reversible.
     * Decrypting private keys back to plain text in a down migration
     * would re-introduce the security vulnerability this migration fixes.
     * If rollback is needed, restore from a pre-migration snapshot.
     */
    console.warn(
      '[Migration] EncryptWalletKeys DOWN: ' +
        'This migration is intentionally non-reversible. ' +
        'Restore from a pre-migration snapshot if needed.',
    );
  }
}

// ─── Inline encrypt helper (no DI available in migrations) ───────────────────

function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([authTag, encrypted]);

  return `${iv.toString('base64')}:${payload.toString('base64')}`;
}
