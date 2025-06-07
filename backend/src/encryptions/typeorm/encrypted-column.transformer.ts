import type { ValueTransformer } from "typeorm"
import type { EncryptionService } from "../encryption.service"

/**
 * TypeORM value transformer for encrypted columns
 * Automatically encrypts data before saving to database and decrypts after loading
 */
export class EncryptedColumnTransformer implements ValueTransformer {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly type: "string" | "number" | "boolean" | "object" = "string",
  ) {}

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

      // Convert back to the original type
      switch (this.type) {
        case "number":
          return Number(decryptedString)
        case "boolean":
          return decryptedString === "true"
        case "object":
          return JSON.parse(decryptedString)
        case "string":
        default:
          return decryptedString
      }
    } catch (error) {
      console.error("Error decrypting data:", error.message)
      return null
    }
  }
}
