import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { WalletEntity } from '../../users/entities/wallet.entity';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Handles AES-256-GCM encryption of wallet private keys.
 * Private keys are NEVER returned in API responses (select: false on column).
 * Decryption is only available for internal signing operations.
 */
@Injectable()
export class WalletKeyEncryptionService {
  private readonly logger = new Logger(WalletKeyEncryptionService.name);
  private readonly encryptionKey: Buffer;

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly config: ConfigService,
  ) {
    const hexKey = this.config.get<string>('WALLET_ENCRYPTION_KEY') ?? '';
    if (hexKey.length !== 64) {
      this.logger.warn('WALLET_ENCRYPTION_KEY not set or invalid — wallet encryption disabled');
    }
    this.encryptionKey = hexKey.length === 64 ? Buffer.from(hexKey, 'hex') : Buffer.alloc(32);
  }

  /** Encrypt a private key with a fresh random IV. */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.encryptionKey, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${Buffer.concat([authTag, encrypted]).toString('base64')}`;
  }

  /** Decrypt — only for internal signing, never exposed externally. */
  decrypt(encryptedValue: string, keyOverride?: Buffer): string {
    const key = keyOverride ?? this.encryptionKey;
    const [ivB64, payloadB64] = encryptedValue.split(':');
    const iv = Buffer.from(ivB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');
    const authTag = payload.subarray(0, TAG_LENGTH);
    const ciphertext = payload.subarray(TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  isEncrypted(value: string): boolean {
    const parts = value.split(':');
    if (parts.length !== 2) return false;
    try { return Buffer.from(parts[0], 'base64').length === IV_LENGTH; } catch { return false; }
  }

  /**
   * Admin-triggered key rotation: re-encrypts all wallets from oldKeyHex to current key.
   * Atomic per wallet — restartable on failure.
   */
  async rotateKeys(oldKeyHex: string, targetVersion: number): Promise<{ rotated: number; failed: number }> {
    if (oldKeyHex.length !== 64) throw new Error('oldKeyHex must be 64 hex chars');
    const oldKey = Buffer.from(oldKeyHex, 'hex');

    const wallets = await this.walletRepo
      .createQueryBuilder('w')
      .addSelect('w.privateKeyEncrypted')
      .where('w.keyVersion < :v', { v: targetVersion })
      .andWhere('w.privateKeyEncrypted IS NOT NULL')
      .getMany();

    let rotated = 0, failed = 0;

    for (const wallet of wallets) {
      try {
        const plain = this.decrypt(wallet.privateKeyEncrypted!, oldKey);
        const newEncrypted = this.encrypt(plain);
        await this.walletRepo.update(wallet.id, { privateKeyEncrypted: newEncrypted, keyVersion: targetVersion });
        rotated++;
      } catch (err: any) {
        this.logger.error(`Key rotation failed for wallet ${wallet.id}: ${err.message}`);
        failed++;
      }
    }

    this.logger.log(`Key rotation complete: rotated=${rotated} failed=${failed}`);
    return { rotated, failed };
  }
}
