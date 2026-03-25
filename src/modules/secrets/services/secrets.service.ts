import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Between, MoreThan, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { SecretType, SecretVersion } from '../entities/secret-version.entity';
import { RotateSecretDto } from '../dto/rotate-secret.dto';

// Default 5-minute grace window unless overridden
const DEFAULT_GRACE_MINUTES = Number(process.env.SECRET_GRACE_PERIOD_MINUTES || 5);

@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);
  private readonly graceMs = DEFAULT_GRACE_MINUTES * 60 * 1000;

  constructor(
    @InjectRepository(SecretVersion)
    private readonly secretRepo: Repository<SecretVersion>,
  ) {}

  private now() {
    return new Date();
  }

  private generateSecretValue(type: SecretType): string {
    // Use longer key for JWT tokens
    const bytes = type === 'JWT' ? 48 : 32;
    return randomBytes(bytes).toString('base64url');
  }

  async getActiveSecret(type: SecretType): Promise<string> {
    const active = await this.secretRepo.findOne({
      where: { type, expiresAt: null },
      order: { version: 'DESC' },
    });

    if (!active) {
      throw new NotFoundException(`No active secret found for type: ${type}`);
    }

    return active.value;
  }

  /**
   * Returns all non-expired secrets (active + grace window) ordered newest first.
   */
  async getValidSecrets(type: SecretType): Promise<string[]> {
    const now = this.now();
    const secrets = await this.secretRepo.find({
      where: [
        { type, expiresAt: null },
        { type, expiresAt: MoreThan(now) },
      ],
      order: { version: 'DESC' },
    });
    return secrets.map((s) => s.value);
  }

  async rotateSecret(
    dto: RotateSecretDto,
  ): Promise<{ message: string; newVersion: number; expiresAt: Date | null }>
  {
    const now = this.now();
    const graceMinutes = dto.gracePeriodMinutes ?? this.graceMs / 60000;
    const currentActive = await this.secretRepo.findOne({
      where: [{ type: dto.type, expiresAt: null }],
      order: { version: 'DESC' },
    });

    const nextVersion = currentActive ? currentActive.version + 1 : 1;

    if (currentActive) {
      currentActive.expiresAt = new Date(now.getTime() + graceMinutes * 60 * 1000);
      await this.secretRepo.save(currentActive);
    }

    const newSecret = this.secretRepo.create({
      type: dto.type,
      version: nextVersion,
      value: dto.newValue || this.generateSecretValue(dto.type),
      expiresAt: null,
    });

    await this.secretRepo.save(newSecret);

    this.logger.log(
      `Secret rotated — type: ${dto.type}, version: ${nextVersion}. Grace period ${graceMinutes} minute(s).`,
    );

    return {
      message: `Secret rotated successfully to version ${nextVersion}`,
      newVersion: nextVersion,
      expiresAt: currentActive?.expiresAt || null,
    };
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async purgeExpiredSecrets(): Promise<void> {
    const now = this.now();
    const result = await this.secretRepo.delete({ expiresAt: Between(new Date(0), now) });
    if (result.affected && result.affected > 0) {
      this.logger.log(`Purged ${result.affected} expired secret version(s)`);
    }
  }

  async getRotationHistory(type: SecretType) {
    return this.secretRepo.find({
      where: { type },
      select: ['id', 'type', 'version', 'expiresAt', 'createdAt'],
      order: { version: 'DESC' },
    });
  }
}
