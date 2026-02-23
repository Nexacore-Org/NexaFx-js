import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SecretEntity, SecretType } from '../entities/secret.entity';
import { RotateSecretDto } from '../dto/rotate-secret.dto';

/** Grace period: old secret versions remain valid for 1 hour post-rotation */
const GRACE_PERIOD_MS = 60 * 60 * 1000;

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(
    @InjectRepository(SecretEntity)
    private readonly secretRepo: Repository<SecretEntity>,
  ) {}

  /**
   * Returns the current active secret value for a given type.
   */
  async getActiveSecret(type: SecretType): Promise<string> {
    const secret = await this.secretRepo.findOne({
      where: { type, isActive: true },
      order: { version: 'DESC' },
    });

    if (!secret) {
      throw new NotFoundException(`No active secret found for type: ${type}`);
    }

    return secret.value;
  }

  /**
   * Returns all valid secrets for a given type within the grace period.
   * Used for JWT verification fallback — allows tokens signed with a recently
   * rotated key to remain valid during the grace window.
   */
  async getValidSecrets(type: SecretType): Promise<string[]> {
    const graceCutoff = new Date(Date.now() - GRACE_PERIOD_MS);

    const secrets = await this.secretRepo
      .createQueryBuilder('s')
      .where('s.type = :type', { type })
      .andWhere(
        '(s.isActive = true OR (s.retiredAt IS NOT NULL AND s.retiredAt > :graceCutoff))',
        { graceCutoff },
      )
      .orderBy('s.version', 'DESC')
      .getMany();

    return secrets.map((s) => s.value);
  }

  /**
   * Rotates a secret: creates new version, marks old version as retired (not immediately deleted).
   * Old version remains usable for GRACE_PERIOD_MS for backward compatibility.
   */
  async rotateSecret(
    dto: RotateSecretDto,
  ): Promise<{ message: string; newVersion: number }> {
    const currentActive = await this.secretRepo.findOne({
      where: { type: dto.type, isActive: true },
      order: { version: 'DESC' },
    });

    const nextVersion = currentActive ? currentActive.version + 1 : 1;

    // Retire current active secret (start grace period clock)
    if (currentActive) {
      currentActive.isActive = false;
      currentActive.retiredAt = new Date();
      await this.secretRepo.save(currentActive);
    }

    // Create new active version
    const newSecret = this.secretRepo.create({
      type: dto.type,
      version: nextVersion,
      value: dto.newValue,
      isActive: true,
    });

    await this.secretRepo.save(newSecret);

    this.logger.log(
      `Secret rotated — type: ${dto.type}, version: ${nextVersion}. ` +
        `Previous version enters ${GRACE_PERIOD_MS / 60000}-minute grace period.`,
    );

    return {
      message: `Secret rotated successfully to version ${nextVersion}`,
      newVersion: nextVersion,
    };
  }

  /**
   * Cron job: purge secrets that have been retired past the grace period.
   * Runs every 30 minutes.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async purgeExpiredSecrets(): Promise<void> {
    const expiryThreshold = new Date(Date.now() - GRACE_PERIOD_MS);

    const result = await this.secretRepo
      .createQueryBuilder()
      .delete()
      .from(SecretEntity)
      .where('isActive = false')
      .andWhere('retiredAt < :expiryThreshold', { expiryThreshold })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Purged ${result.affected} expired secret version(s)`);
    }
  }

  /**
   * Returns rotation audit log (non-sensitive — versions and timestamps only).
   */
  async getRotationHistory(type: SecretType) {
    return this.secretRepo.find({
      where: { type },
      select: ['id', 'type', 'version', 'isActive', 'retiredAt', 'createdAt'],
      order: { version: 'DESC' },
    });
  }
}
