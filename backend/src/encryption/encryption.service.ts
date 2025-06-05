import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 16; // 128 bits
  private readonly tagLength = 16; // 128 bits
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    
    if (!encryptionKey) {
      throw new Error('ENCRYPTION_KEY environment variable is required');
    }

    // Derive a consistent key from the provided key
    this.key = crypto.scryptSync(encryptionKey, 'salt', this.keyLength);
  }

  /**
   * Encrypts a string value
   * @param text The plain text to encrypt
   * @returns Encrypted string in format: iv:tag:encrypted
   */
  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipherGCM(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine iv, tag, and encrypted data
      return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
    } catch (error) {
      this.logger.error('Encryption failed', error.stack);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypts an encrypted string
   * @param encryptedData The encrypted string in format: iv:tag:encrypted
   * @returns Decrypted plain text
   */
  decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const [ivHex, tagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      
      const decipher = crypto.createDecipherGCM(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed', error.stack);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Encrypts an object's sensitive fields
   * @param obj The object to encrypt
   * @param fields Array of field names to encrypt
   * @returns Object with encrypted fields
   */
  encryptFields<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };
    
    for (const field of fields) {
      if (result[field] && typeof result[field] === 'string') {
        result[field] = this.encrypt(result[field] as string) as T[keyof T];
      }
    }
    
    return result;
  }

  /**
   * Decrypts an object's encrypted fields
   * @param obj The object with encrypted fields
   * @param fields Array of field names to decrypt
   * @returns Object with decrypted fields
   */
  decryptFields<T extends Record<string, any>>(
    obj: T,
    fields: (keyof T)[]
  ): T {
    const result = { ...obj };
    
    for (const field of fields) {
      if (result[field] && typeof result[field] === 'string') {
        result[field] = this.decrypt(result[field] as string) as T[keyof T];
      }
    }
    
    return result;
  }

  /**
   * Generates a secure random encryption key
   * @returns Base64 encoded random key
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('base64');
  }
}