import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeatureFlagEntity } from '../entities/feature-flag.entity';
import { CreateFeatureFlagDto } from '../dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from '../dto/update-feature-flag.dto';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private cache: Map<string, FeatureFlagEntity> = new Map();
  private cacheExpiry = 5 * 60 * 1000; // 5 minutes
  private lastCacheTime = 0;

  constructor(
    @InjectRepository(FeatureFlagEntity)
    private readonly repository: Repository<FeatureFlagEntity>,
  ) {}

  /**
   * Check if a feature flag is enabled
   * Supports per-environment checking
   */
  async isEnabled(flagName: string, environment?: string): Promise<boolean> {
    const flag = await this.getFlag(flagName);
    if (!flag) {
      return false;
    }

    // If environment is specified, check environment-specific setting
    if (environment && flag.environments) {
      const envEnabled = flag.environments[environment];
      // If explicitly set in environments, use that; otherwise fall back to global enabled
      if (envEnabled !== undefined) {
        return envEnabled;
      }
    }

    return flag.enabled;
  }

  /**
   * Get a single flag by name (with caching)
   */
  private async getFlag(flagName: string): Promise<FeatureFlagEntity | null> {
    // Check cache
    if (this.cache.has(flagName)) {
      const cached = this.cache.get(flagName);
      if (cached && Date.now() - this.lastCacheTime < this.cacheExpiry) {
        return cached;
      }
    }

    // Query database
    const flag = await this.repository.findOne({
      where: { name: flagName },
    });

    if (flag) {
      this.cache.set(flagName, flag);
    }

    return flag || null;
  }

  /**
   * Get all flags
   */
  async getAllFlags(): Promise<FeatureFlagEntity[]> {
    return this.repository.find({
      order: { name: 'ASC' },
    });
  }

  /**
   * Create a new feature flag
   */
  async createFlag(dto: CreateFeatureFlagDto): Promise<FeatureFlagEntity> {
    const flag = this.repository.create(dto);
    const saved = await this.repository.save(flag);
    this.invalidateCache();
    this.logger.log(`Feature flag created: ${saved.name}`);
    return saved;
  }

  /**
   * Update an existing feature flag
   */
  async updateFlag(
    id: string,
    dto: UpdateFeatureFlagDto,
  ): Promise<FeatureFlagEntity> {
    await this.repository.update(id, dto);
    const updated = await this.repository.findOne({ where: { id } });
    if (!updated) {
      throw new Error(`Feature flag with id ${id} not found`);
    }
    this.invalidateCache();
    this.logger.log(`Feature flag updated: ${updated.name}`);
    return updated;
  }

  /**
   * Delete a feature flag
   */
  async deleteFlag(id: string): Promise<void> {
    const flag = await this.repository.findOne({ where: { id } });
    if (flag) {
      await this.repository.delete(id);
      this.invalidateCache();
      this.logger.log(`Feature flag deleted: ${flag.name}`);
    }
  }

  /**
   * Get flag by ID
   */
  async getFlagById(id: string): Promise<FeatureFlagEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * Invalidate cache (called after mutations)
   */
  private invalidateCache(): void {
    this.cache.clear();
    this.lastCacheTime = Date.now();
  }

  /**
   * Clear cache and refresh from database
   */
  async refreshCache(): Promise<void> {
    this.invalidateCache();
    this.logger.log('Feature flags cache refreshed');
  }
}
