import { MigrationInterface, QueryRunner } from 'typeorm';
import * as crypto from 'crypto';

const SEALED_PREFIX = 'enc:';
const IV_BYTES = 12;

/**
 * #1609: backfill existing plaintext webhook signing secrets into the same
 * `enc:<version>:<base64>` envelope used by EncryptionService. New endpoints
 * are encrypted on creation; the processor still accepts plaintext during the
 * rollout, so this migration is safe to run after deployment.
 */
export class EncryptWebhookEndpointSecrets1760000000000
  implements MigrationInterface
{
  name = 'EncryptWebhookEndpointSecrets1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hex = process.env.WALLET_ENCRYPTION_KEY;
    if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
      // No usable key: leave rows as plaintext; the helper decrypts both forms.
      console.warn('Skipping webhook secret backfill: WALLET_ENCRYPTION_KEY is not a 32-byte hex key');
      return;
    }
    const version = parseInt(process.env.WALLET_ENCRYPTION_KEY_VERSION ?? '1', 10);
    const key = Buffer.from(hex, 'hex');
    const rows = (await queryRunner.query(
      'SELECT id, secret FROM webhook_endpoints',
    )) as Array<{ id: string; secret: string }>;
    for (const row of rows) {
      if (!row.secret || row.secret.startsWith(SEALED_PREFIX)) continue;
      const iv = crypto.randomBytes(IV_BYTES);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const encrypted = Buffer.concat([
        cipher.update(row.secret, 'utf8'),
        cipher.final(),
      ]);
      const combined = Buffer.concat([iv, encrypted, cipher.getAuthTag()]);
      await queryRunner.query(
        'UPDATE webhook_endpoints SET secret = $1 WHERE id = $2',
        [`${SEALED_PREFIX}${version}:${combined.toString('base64')}`, row.id],
      );
    }
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Irreversible by design: plaintext cannot be recovered from ciphertext.
  }
}
