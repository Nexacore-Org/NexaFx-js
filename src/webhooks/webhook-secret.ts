import type { EncryptionService } from '../common/encryption/encryption.service';

const SEALED_PREFIX = 'enc:';

/** Signing secrets are encrypted with the same key store as other secrets. */
export function sealWebhookSecret(
  encryption: EncryptionService,
  plaintext: string,
): string {
  const { ciphertext, keyVersion } = encryption.encrypt(plaintext);
  return `${SEALED_PREFIX}${keyVersion}:${ciphertext}`;
}

/**
 * Decrypt a stored secret. Plaintext values from before the backfill are
 * returned unchanged so in-flight deliveries keep working during migration.
 */
export function openWebhookSecret(
  encryption: EncryptionService,
  stored: string,
): string {
  if (!stored?.startsWith(SEALED_PREFIX)) return stored;
  const [, version, ...rest] = stored.split(':');
  return encryption.decrypt({
    keyVersion: Number(version),
    ciphertext: rest.join(':'),
  });
}
