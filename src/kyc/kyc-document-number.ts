import type { EncryptionService } from '../common/encryption/encryption.service';

const SEALED_PREFIX = 'enc:';

/** Case/space/dash-insensitive form used for duplicate detection ("AB-123 45" == "ab12345"). */
export function normaliseDocumentNumber(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(SEALED_PREFIX);
}

/** Encrypt a document number and compute its blind index (issue #1535). */
export function sealDocumentNumber(encryption: EncryptionService, plain: string): { stored: string; hash: string } {
  const { ciphertext, keyVersion } = encryption.encrypt(plain);
  return {
    stored: `${SEALED_PREFIX}${keyVersion}:${ciphertext}`,
    hash: encryption.blindIndex(normaliseDocumentNumber(plain)),
  };
}

/** Decrypt a stored value; legacy plaintext rows (pre-backfill) are returned as they are. */
export function openDocumentNumber(encryption: EncryptionService, stored: string): string {
  if (!isSealed(stored)) return stored;
  const [, version, ...rest] = stored.split(':');
  return encryption.decrypt({ keyVersion: Number(version), ciphertext: rest.join(':') });
}

export function last4(plain: string): string {
  return plain.slice(-4);
}
