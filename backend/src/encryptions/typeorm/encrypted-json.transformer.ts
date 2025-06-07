import type { ValueTransformer } from "typeorm"
import type { EncryptionService } from "../encryption.service"

/**
 * TypeORM value transformer for encrypted JSON columns
 * Automatically encrypts JSON data before saving to database and decrypts after loading
 */
export class EncryptedJsonTransformer implements ValueTransformer {
  constructor(private readonly encryptionService: EncryptionService) {}

  /**
   * Transform the value before it is written to the database
   */
  to(value: any): string | null {
    if (value === undefined || value === null) {
      return null
    }

    const encrypted = this.encryptionService.encrypt(value)
    return JSON.stringify(encrypted)
  }

  /**
   * Transform the value after it is loaded from the database
   */
  from(value: string): any {
    if (!value) {
      return null
    }

    try {
      const encryptedData = JSON.parse(value)
      const decryptedString = this.encryptionService.decrypt(encryptedData)

      if (!decryptedString) {
        return null
      }

      return JSON.parse(decryptedString)
    } catch (error) {
      console.error("Error decrypting JSON data:", error.message)
      return null
    }
  }
}
