import { Injectable } from "@nestjs/common"
import * as crypto from "crypto"
import type { Repository } from "typeorm"
import { EncryptionKey } from "./encryption-key.entity"
import type { ConfigService } from "@nestjs/config"

@Injectable()
export class KeyRotationService {
  constructor(
    private readonly encryptionKeyRepository: Repository<EncryptionKey>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate a new encryption key and store it
   * @param description Optional description for the key
   * @returns The newly created encryption key
   */
  async generateNewKey(description?: string): Promise<EncryptionKey> {
    const keyLength = this.configService.get<number>("ENCRYPTION_KEY_LENGTH", 32)
    const keyValue = crypto.randomBytes(keyLength).toString("hex")

    const key = new EncryptionKey()
    key.value = keyValue
    key.description = description || `Key generated on ${new Date().toISOString()}`
    key.isActive = true
    key.version = await this.getNextKeyVersion()

    return this.encryptionKeyRepository.save(key)
  }

  /**
   * Get the current active encryption key
   * @returns The active encryption key or null if none exists
   */
  async getCurrentKey(): Promise<EncryptionKey | null> {
    return this.encryptionKeyRepository.findOne({
      where: { isActive: true },
      order: { version: "DESC" },
    })
  }

  /**
   * Get a specific encryption key by ID
   * @param id Key ID
   * @returns The encryption key or null if not found
   */
  async getKeyById(id: string): Promise<EncryptionKey | null> {
    return this.encryptionKeyRepository.findOne({
      where: { id },
    })
  }

  /**
   * Get a specific encryption key by version
   * @param version Key version
   * @returns The encryption key or null if not found
   */
  async getKeyByVersion(version: number): Promise<EncryptionKey | null> {
    return this.encryptionKeyRepository.findOne({
      where: { version },
    })
  }

  /**
   * Rotate encryption keys - create a new key and mark it as active
   * @param deactivateOldKeys Whether to deactivate all old keys
   * @returns The newly created active key
   */
  async rotateKeys(deactivateOldKeys = false): Promise<EncryptionKey> {
    const newKey = await this.generateNewKey("Rotated key")

    if (deactivateOldKeys) {
      await this.encryptionKeyRepository.update({ id: newKey.id }, { isActive: false })
    }

    return newKey
  }

  /**
   * Get all encryption keys
   * @returns Array of all encryption keys
   */
  async getAllKeys(): Promise<EncryptionKey[]> {
    return this.encryptionKeyRepository.find({
      order: { version: "DESC" },
    })
  }

  /**
   * Get the next key version number
   * @returns The next version number
   */
  private async getNextKeyVersion(): Promise<number> {
    const highestVersion = await this.encryptionKeyRepository
      .createQueryBuilder("key")
      .select("MAX(key.version)", "maxVersion")
      .getRawOne()

    return (highestVersion?.maxVersion || 0) + 1
  }
}
