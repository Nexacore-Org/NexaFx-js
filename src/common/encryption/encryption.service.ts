import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_HEX_LENGTH = 64; // 32 bytes
const MAX_KEY_VERSION = 10;

export interface EncryptedPayload {
  /** base64(iv + ciphertext + authTag) */
  ciphertext: string;
  /** key version used to encrypt */
  keyVersion: number;
}

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  /** Map of version → 32-byte key buffer */
  private readonly keys = new Map<number, Buffer>();
  private currentVersion: number;

  constructor(private readonly config: ConfigService) {
    // Validate everything at boot: a bad key must stop the app here, not
    // surface as "Invalid key length" on the first wallet operation.
    const envKeys = this.validateKeys(this.resolveKeys());
    this.currentVersion = Math.max(...envKeys.map((k) => k.version));
    for (const { version, hex } of envKeys) {
      this.keys.set(version, Buffer.from(hex, 'hex'));
    }
  }

  encrypt(plaintext: string): EncryptedPayload {
    const key = this.keys.get(this.currentVersion)!;
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    const combined = Buffer.concat([iv, encrypted, tag]);
    return { ciphertext: combined.toString('base64'), keyVersion: this.currentVersion };
  }

  decrypt(payload: EncryptedPayload): string {
    const key = this.keys.get(payload.keyVersion);
    if (!key) {
      throw new Error(`No key available for version ${payload.keyVersion}`);
    }
    const combined = Buffer.from(payload.ciphertext, 'base64');
    if (combined.length < IV_BYTES + TAG_BYTES) {
      throw new Error(
        `Ciphertext is too short: expected at least ${IV_BYTES + TAG_BYTES} bytes (iv + auth tag), got ${combined.length}`,
      );
    }
    const iv = combined.subarray(0, IV_BYTES);
    const tag = combined.subarray(combined.length - TAG_BYTES);
    const ciphertext = combined.subarray(IV_BYTES, combined.length - TAG_BYTES);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }

  getCurrentVersion(): number {
    return this.currentVersion;
  }

  hasKey(version: number): boolean {
    return this.keys.has(version);
  }

  /** Re-encrypt a payload under the current key version. No-op if already current. */
  reencrypt(payload: EncryptedPayload): EncryptedPayload {
    if (payload.keyVersion === this.currentVersion) return payload;
    return this.encrypt(this.decrypt(payload));
  }

  private validateKeys(
    keys: Array<{ version: number; hex: string | undefined }>,
  ): Array<{ version: number; hex: string }> {
    if (keys.length === 0) {
      throw new Error('No wallet encryption key configured (set WALLET_ENCRYPTION_KEY)');
    }
    const seen = new Set<number>();
    for (const { version, hex } of keys) {
      if (!Number.isInteger(version) || version < 1) {
        throw new Error(`WALLET_ENCRYPTION_KEY_VERSION must be a positive integer, got "${version}"`);
      }
      if (seen.has(version)) {
        throw new Error(
          `Duplicate wallet encryption key version ${version}: WALLET_ENCRYPTION_KEY_VERSION collides with WALLET_ENCRYPTION_KEY_V${version}`,
        );
      }
      seen.add(version);
      if (!hex) {
        throw new Error(`Wallet encryption key for version ${version} is missing`);
      }
      if (!new RegExp(`^[0-9a-fA-F]{${KEY_HEX_LENGTH}}$`).test(hex)) {
        throw new Error(
          `Wallet encryption key for version ${version} must be ${KEY_HEX_LENGTH} hex characters (32 bytes)`,
        );
      }
    }
    return keys as Array<{ version: number; hex: string }>;
  }

  private resolveKeys(): Array<{ version: number; hex: string | undefined }> {
    // Primary key: WALLET_ENCRYPTION_KEY (version 1 unless overridden)
    const primaryHex =
      this.config.get<string>('wallet.encryptionKey') ??
      process.env.WALLET_ENCRYPTION_KEY;
    const primaryVersion = parseInt(
      process.env.WALLET_ENCRYPTION_KEY_VERSION ?? '1',
      10,
    );
    const result: Array<{ version: number; hex: string | undefined }> = [
      { version: primaryVersion, hex: primaryHex },
    ];

    // Additional versioned keys: WALLET_ENCRYPTION_KEY_V2, _V3, …
    for (let v = 2; v <= MAX_KEY_VERSION; v++) {
      const hex = process.env[`WALLET_ENCRYPTION_KEY_V${v}`];
      if (hex) result.push({ version: v, hex });
    }
    return result;
  }
}
