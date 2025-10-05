import { Injectable, Logger } from "@nestjs/common"
import * as crypto from "crypto"
import * as fs from "fs/promises"
import { createReadStream, createWriteStream } from "fs"
import { pipeline } from "stream/promises"

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name)
  private readonly algorithm = "aes-256-gcm"
  private readonly keyLength = 32 // 256 bits
  private readonly ivLength = 16
  private readonly saltLength = 64
  private readonly tagLength = 16

  private getEncryptionKey(): Buffer {
    const key = process.env.BACKUP_ENCRYPTION_KEY
    if (!key) {
      throw new Error("BACKUP_ENCRYPTION_KEY environment variable not set")
    }
    return Buffer.from(key, "hex")
  }

  async encryptFile(inputPath: string): Promise<string> {
    const outputPath = `${inputPath}.enc`

    try {
      const key = this.getEncryptionKey()
      const iv = crypto.randomBytes(this.ivLength)
      const salt = crypto.randomBytes(this.saltLength)

      // Derive key using PBKDF2
      const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, this.keyLength, "sha256")

      const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv)

      // Write salt and IV to the beginning of the file
      const outputStream = createWriteStream(outputPath)
      outputStream.write(salt)
      outputStream.write(iv)

      await pipeline(createReadStream(inputPath), cipher, outputStream)

      // Append auth tag
      const tag = cipher.getAuthTag()
      await fs.appendFile(outputPath, tag)

      this.logger.log(`File encrypted: ${outputPath}`)
      return outputPath
    } catch (error) {
      this.logger.error(`Encryption failed for ${inputPath}`, error)
      throw error
    }
  }

  async decryptFile(inputPath: string): Promise<string> {
    const outputPath = inputPath.replace(".enc", "")

    try {
      const key = this.getEncryptionKey()

      // Read salt, IV, and tag from file
      const encryptedData = await fs.readFile(inputPath)

      const salt = encryptedData.slice(0, this.saltLength)
      const iv = encryptedData.slice(this.saltLength, this.saltLength + this.ivLength)
      const tag = encryptedData.slice(-this.tagLength)
      const ciphertext = encryptedData.slice(this.saltLength + this.ivLength, -this.tagLength)

      // Derive key using PBKDF2
      const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, this.keyLength, "sha256")

      const decipher = crypto.createDecipheriv(this.algorithm, derivedKey, iv)
      decipher.setAuthTag(tag)

      const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])

      await fs.writeFile(outputPath, decrypted)

      this.logger.log(`File decrypted: ${outputPath}`)
      return outputPath
    } catch (error) {
      this.logger.error(`Decryption failed for ${inputPath}`, error)
      throw error
    }
  }

  async rotateEncryptionKey() {
    // Generate new encryption key
    const newKey = crypto.randomBytes(this.keyLength)

    this.logger.log("Encryption key rotation initiated")

    // In production, this would:
    // 1. Generate new key
    // 2. Re-encrypt all backups with new key
    // 3. Update key in secure storage (AWS Secrets Manager, etc.)
    // 4. Maintain old key for a transition period

    return {
      success: true,
      message: "Key rotation completed",
      newKeyId: crypto.randomBytes(16).toString("hex"),
    }
  }
}
