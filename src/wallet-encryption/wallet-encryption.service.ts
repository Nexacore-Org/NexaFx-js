import {
  Injectable,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128-bit IV
const TAG_LENGTH = 16; // 128-bit auth tag
const KEY_LENGTH = 32; // 256-bit key (hex = 64 chars)

/**
 * Encrypted value format:  base64(iv) + ':' + base64(authTag + ciphertext)
 *
 * The colon separator makes it trivial to split without length-prefix parsing
 * and keeps the value safely storable in a VARCHAR/TEXT column.
 */
@Injectable()
export class WalletEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(WalletEncryptionService.name);
  private encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const hexKey = this.configService.get<string>('WALLET_ENCRYPTION_KEY');

    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        'WALLET_ENCRYPTION_KEY must be a 64-character hex string (32 bytes / 256-bit).',
      );
    }

    this.encryptionKey = Buffer.from(hexKey, 'hex');
    this.logger.log('WalletEncryptionService initialised — key loaded.');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Encrypt a plain-text private key.
   * A fresh random IV is generated for every call, so the same plaintext
   * produces a different ciphertext each time.
   *
   * @returns base64(iv) + ':' + base64(authTag + ciphertext)
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv, {
        authTagLength: TAG_LENGTH,
      });

      const encrypted = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
      ]);

      const authTag = cipher.getAuthTag();

      // Prepend the auth-tag to ciphertext so they travel together
      const payload = Buffer.concat([authTag, encrypted]);

      return `${iv.toString('base64')}:${payload.toString('base64')}`;
    } catch {
      // Never log the plaintext
      throw new Error('Wallet key encryption failed.');
    }
  }

  /**
   * Decrypt an encrypted private key.
   * Accepts an optional override key (Buffer) for use during key rotation.
   */
  decrypt(encryptedValue: string, keyOverride?: Buffer): string {
    try {
      const key = keyOverride ?? this.encryptionKey;
      const [ivB64, payloadB64] = encryptedValue.split(':');

      if (!ivB64 || !payloadB64) {
        throw new BadRequestException('Malformed encrypted wallet key.');
      }

      const iv = Buffer.from(ivB64, 'base64');
      const payload = Buffer.from(payloadB64, 'base64');

      // First TAG_LENGTH bytes are the auth tag; the rest is ciphertext
      const authTag = payload.subarray(0, TAG_LENGTH);
      const ciphertext = payload.subarray(TAG_LENGTH);

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
        authTagLength: TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (err) {
      // Never surface details that might expose key material
      if (err instanceof BadRequestException) throw err;
      throw new Error('Wallet key decryption failed — possible tampering or wrong key.');
    }
  }

  /**
   * Re-encrypt a value from an old key to the current key.
   * Used during key rotation.
   */
  reEncrypt(encryptedValue: string, oldKeyHex: string): string {
    if (!oldKeyHex || oldKeyHex.length !== 64) {
      throw new Error('Old key must be a 64-character hex string.');
    }
    const oldKey = Buffer.from(oldKeyHex, 'hex');
    const plaintext = this.decrypt(encryptedValue, oldKey);
    return this.encrypt(plaintext);
  }

  /**
   * Returns true if the value looks like our encrypted format.
   * Used in migration to skip already-encrypted rows.
   */
  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 2) return false;
    try {
      const iv = Buffer.from(parts[0], 'base64');
      return iv.length === IV_LENGTH;
    } catch {
      return false;
    }
  }

  /**
   * Safely derive a key Buffer from a hex string — exposed for migration/jobs.
   */
  hexToKey(hexKey: string): Buffer {
    if (!hexKey || hexKey.length !== KEY_LENGTH * 2) {
      throw new Error(`Key must be ${KEY_LENGTH * 2} hex chars.`);
    }
    return Buffer.from(hexKey, 'hex');
  }
}
