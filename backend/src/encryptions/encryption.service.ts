import { Injectable, type OnModuleInit } from "@nestjs/common"
import * as crypto from "crypto"
import type { ConfigService } from "@nestjs/config"

export interface EncryptionOptions {
  algorithm?: string
  ivLength?: number
  keyLength?: number
}

export interface EncryptedData {
  iv: string
  encryptedData: string
  tag?: string
  keyId?: string
}

@Injectable()
export class EncryptionService implements OnModuleInit {
  private defaultAlgorithm: string
  private defaultIvLength: number
  private defaultKeyLength: number
  private encryptionKey: Buffer
  private keyId: string

  constructor(private readonly configService: ConfigService) {
    this.defaultAlgorithm = this.configService.get<string>("ENCRYPTION_ALGORITHM", "aes-256-gcm")
    this.defaultIvLength = this.configService.get<number>("ENCRYPTION_IV_LENGTH", 16)
    this.defaultKeyLength = this.configService.get<number>("ENCRYPTION_KEY_LENGTH", 32)
    this.keyId = this.configService.get<string>("ENCRYPTION_KEY_ID", "default")
  }

  async onModuleInit() {
    await this.initializeEncryptionKey()
  }

  private async initializeEncryptionKey() {
    const storedKey = this.configService.get<string>("ENCRYPTION_KEY")

    if (storedKey) {
      // Use the stored key if available
      this.encryptionKey = Buffer.from(storedKey, "hex")
    } else {
      // Generate a new key if not available
      this.encryptionKey = crypto.randomBytes(this.defaultKeyLength)
      console.warn(
        "No encryption key found in environment variables. Generated a new key. " +
          "This key will change on application restart, which will make previously encrypted data unreadable. " +
          "Set ENCRYPTION_KEY environment variable with this value for persistence:",
        this.encryptionKey.toString("hex"),
      )
    }
  }

  /**
   * Encrypt data using the configured encryption algorithm
   * @param data Data to encrypt (string, number, boolean, or object)
   * @param options Optional encryption options
   * @returns Encrypted data object with IV and encrypted content
   */
  encrypt(data: string | number | boolean | object, options?: EncryptionOptions): EncryptedData {
    if (data === null || data === undefined) {
      return null
    }

    const algorithm = options?.algorithm || this.defaultAlgorithm
    const ivLength = options?.ivLength || this.defaultIvLength

    // Convert data to string if it's not already
    const dataString = typeof data === "string" ? data : JSON.stringify(data)

    // Generate a random initialization vector
    const iv = crypto.randomBytes(ivLength)

    // Create cipher with key and iv
    const cipher = crypto.createCipheriv(algorithm, this.encryptionKey, iv) as crypto.CipherGCM

    // Encrypt the data
    let encrypted = cipher.update(dataString, "utf8", "hex")
    encrypted += cipher.final("hex")

    // Get the authentication tag (for GCM mode)
    const tag = algorithm.includes("gcm") ? cipher.getAuthTag().toString("hex") : undefined

    return {
      iv: iv.toString("hex"),
      encryptedData: encrypted,
      tag,
      keyId: this.keyId,
    }
  }

  /**
   * Decrypt previously encrypted data
   * @param encryptedData The encrypted data object
   * @param options Optional decryption options
   * @returns Decrypted data (as string)
   */
  decrypt(encryptedData: EncryptedData, options?: EncryptionOptions): string {
    if (!encryptedData || !encryptedData.encryptedData || !encryptedData.iv) {
      return null
    }

    const algorithm = options?.algorithm || this.defaultAlgorithm

    try {
      // Convert IV back to Buffer
      const iv = Buffer.from(encryptedData.iv, "hex")

      // Create decipher
      const decipher = crypto.createDecipheriv(algorithm, this.encryptionKey, iv) as crypto.DecipherGCM

      // Set auth tag for GCM mode
      if (algorithm.includes("gcm") && encryptedData.tag) {
        decipher.setAuthTag(Buffer.from(encryptedData.tag, "hex"))
      }

      // Decrypt the data
      let decrypted = decipher.update(encryptedData.encryptedData, "hex", "utf8")
      decrypted += decipher.final("utf8")

      return decrypted
    } catch (error) {
      console.error("Decryption error:", error.message)
      throw new Error("Failed to decrypt data. The encryption key may have changed.")
    }
  }

  /**
   * Parse decrypted data to its original type
   * @param decryptedString The decrypted string
   * @returns The original data in its original type
   */
  parseDecryptedData(decryptedString: string): any {
    if (!decryptedString) return null

    try {
      // Try to parse as JSON first
      return JSON.parse(decryptedString)
    } catch (e) {
      // If not valid JSON, return as string
      return decryptedString
    }
  }

  /**
   * Generate a new encryption key
   * @param length Key length in bytes
   * @returns Hex string representation of the key
   */
  generateKey(length: number = this.defaultKeyLength): string {
    return crypto.randomBytes(length).toString("hex")
  }

  /**
   * Hash a value using SHA-256
   * @param value Value to hash
   * @returns Hashed value
   */
  hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex")
  }

  /**
   * Create an HMAC signature
   * @param data Data to sign
   * @param key Key to use for signing (defaults to encryption key)
   * @returns HMAC signature
   */
  createHmac(data: string, key?: string): string {
    const hmacKey = key ? Buffer.from(key, "hex") : this.encryptionKey
    return crypto.createHmac("sha256", hmacKey).update(data).digest("hex")
  }

  /**
   * Verify an HMAC signature
   * @param data Original data
   * @param signature HMAC signature to verify
   * @param key Key used for signing (defaults to encryption key)
   * @returns True if signature is valid
   */
  verifyHmac(data: string, signature: string, key?: string): boolean {
    const calculatedSignature = this.createHmac(data, key)
    return crypto.timingSafeEqual(Buffer.from(calculatedSignature, "hex"), Buffer.from(signature, "hex"))
  }
}
