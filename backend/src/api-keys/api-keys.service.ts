import { Injectable, NotFoundException, ConflictException, UnauthorizedException } from "@nestjs/common"
import type { Repository } from "typeorm"
import { ApiKey } from "./entities/api-key.entity"
import type { CreateApiKeyDto } from "./dto/create-api-key.dto"
import type { UpdateApiKeyDto } from "./dto/update-api-key.dto"
import * as crypto from "crypto"

@Injectable()
export class ApiKeysService {
  constructor(private readonly apiKeyRepository: Repository<ApiKey>) {}

  async create(createApiKeyDto: CreateApiKeyDto): Promise<ApiKey> {
    const apiKey = new ApiKey()
    apiKey.key = this.generateApiKey()
    apiKey.name = createApiKeyDto.name
    apiKey.description = createApiKeyDto.description
    apiKey.scopes = createApiKeyDto.scopes
    apiKey.userId = createApiKeyDto.userId

    if (createApiKeyDto.expiresAt) {
      apiKey.expiresAt = new Date(createApiKeyDto.expiresAt)
    }

    try {
      return await this.apiKeyRepository.save(apiKey)
    } catch (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        throw new ConflictException("API key already exists")
      }
      throw error
    }
  }

  async findAll(userId?: string): Promise<ApiKey[]> {
    const query = this.apiKeyRepository.createQueryBuilder("apiKey")

    if (userId) {
      query.where("apiKey.userId = :userId", { userId })
    }

    return query.orderBy("apiKey.createdAt", "DESC").getMany()
  }

  async findOne(id: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { id } })
    if (!apiKey) {
      throw new NotFoundException("API key not found")
    }
    return apiKey
  }

  async findByKey(key: string): Promise<ApiKey | null> {
    return this.apiKeyRepository.findOne({ where: { key } })
  }

  async update(id: string, updateApiKeyDto: UpdateApiKeyDto): Promise<ApiKey> {
    const apiKey = await this.findOne(id)

    Object.assign(apiKey, updateApiKeyDto)

    if (updateApiKeyDto.expiresAt) {
      apiKey.expiresAt = new Date(updateApiKeyDto.expiresAt)
    }

    return this.apiKeyRepository.save(apiKey)
  }

  async remove(id: string): Promise<void> {
    const apiKey = await this.findOne(id)
    await this.apiKeyRepository.remove(apiKey)
  }

  async validateApiKey(key: string): Promise<ApiKey> {
    const apiKey = await this.findByKey(key)

    if (!apiKey) {
      throw new UnauthorizedException("Invalid API key")
    }

    if (!apiKey.isActive) {
      throw new UnauthorizedException("API key is inactive")
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      throw new UnauthorizedException("API key has expired")
    }

    // Update usage statistics
    await this.updateUsageStats(apiKey)

    return apiKey
  }

  async revokeApiKey(id: string): Promise<ApiKey> {
    const apiKey = await this.findOne(id)
    apiKey.isActive = false
    return this.apiKeyRepository.save(apiKey)
  }

  async regenerateApiKey(id: string): Promise<ApiKey> {
    const apiKey = await this.findOne(id)
    apiKey.key = this.generateApiKey()
    apiKey.usageCount = 0
    apiKey.lastUsedAt = null
    return this.apiKeyRepository.save(apiKey)
  }

  private generateApiKey(): string {
    const prefix = "ak_"
    const randomBytes = crypto.randomBytes(32)
    const key = randomBytes.toString("hex")
    return `${prefix}${key}`
  }

  private async updateUsageStats(apiKey: ApiKey): Promise<void> {
    await this.apiKeyRepository.update(apiKey.id, {
      usageCount: apiKey.usageCount + 1,
      lastUsedAt: new Date(),
    })
  }

  async getUsageStats(id: string): Promise<{ usageCount: number; lastUsedAt: Date | null }> {
    const apiKey = await this.findOne(id)
    return {
      usageCount: apiKey.usageCount,
      lastUsedAt: apiKey.lastUsedAt,
    }
  }
}
