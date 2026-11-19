import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { DeviceToken, DevicePlatform } from '../device-token.entity';
import { FeatureFlag } from '../../modules/feature-flags/feature-flags.catalog';
import { FeatureFlagsService } from '../../modules/feature-flags/feature-flags.service';
import { ApnsProvider } from './apns.provider';
import { FcmV1Provider } from './fcm-v1.provider';
import {
  InvalidDeviceTokenError,
  normalizePushError,
  PushDeliveryResult,
  PushPayload,
  PushProvider,
  PushSendError,
  TransientPushError,
} from './push-provider';

export type { PushPayload, PushDeliveryResult } from './push-provider';

const MAX_TOKENS_PER_USER = 20;
const MAX_PARALLEL_SENDS = 10;

function redact(token: string): string {
  return token.length > 8 ? `${token.slice(0, 4)}…${token.slice(-2)}` : '***';
}

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly providers: PushProvider[];

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
    config: ConfigService,
    http: HttpService,
    @Optional() private readonly flags?: FeatureFlagsService,
    @Optional() fcmProvider?: FcmV1Provider,
    @Optional() apnsProvider?: ApnsProvider,
  ) {
    this.providers = [
      fcmProvider ?? new FcmV1Provider(config, http),
      apnsProvider ?? new ApnsProvider(config, http),
    ];
  }

  async registerToken(
    userId: string,
    token: string,
    platform: DevicePlatform,
  ): Promise<DeviceToken> {
    const existing = await this.tokenRepo.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.lastUsedAt = new Date();
      return this.tokenRepo.save(existing);
    }

    const userTokens = await this.tokenRepo.find({
      where: { userId },
      order: { lastUsedAt: 'ASC' },
    });

    if (userTokens.length >= MAX_TOKENS_PER_USER) {
      const oldest = userTokens[0]!;
      await this.tokenRepo.delete({ id: oldest.id });
    }

    const dt = this.tokenRepo.create({ userId, token, platform });
    return this.tokenRepo.save(dt);
  }

  /**
   * Deletes a device token. When `userId` is supplied the delete is scoped to
   * that owner, so a caller cannot deregister another user's device.
   */
  async deregisterToken(token: string, userId?: string): Promise<void> {
    await this.tokenRepo.delete(userId ? { token, userId } : { token });
  }

  /**
   * Delivers to every registered device, at most MAX_PARALLEL_SENDS at a time.
   * Results are returned per device; retryable (5xx/429) failures are also
   * surfaced as a thrown TransientPushError so the caller's queue can retry.
   */
  async sendToUser(
    userId: string,
    payload: PushPayload,
  ): Promise<PushDeliveryResult[]> {
    if (this.flags && !this.flags.isEnabled(FeatureFlag.PUSH_NOTIFICATIONS)) {
      this.logger.warn(
        'Push delivery skipped: FEATURE_PUSH_NOTIFICATIONS is disabled',
      );
      return [];
    }

    const tokens = await this.tokenRepo.find({ where: { userId } });
    if (tokens.length === 0) return [];

    const results: PushDeliveryResult[] = [];
    for (let i = 0; i < tokens.length; i += MAX_PARALLEL_SENDS) {
      const batch = tokens.slice(i, i + MAX_PARALLEL_SENDS);
      results.push(...(await Promise.all(batch.map((dt) => this.deliver(dt, payload)))));
    }

    const retryable = results.filter((result) => result.retryable);
    if (retryable.length > 0) {
      throw new TransientPushError(
        `Push delivery failed for ${retryable.length} device(s): ${retryable
          .map((result) => result.error ?? 'unknown error')
          .join('; ')}`,
        results,
      );
    }

    return results;
  }

  private async deliver(
    dt: DeviceToken,
    payload: PushPayload,
  ): Promise<PushDeliveryResult> {
    const provider = this.providers.find((candidate) =>
      candidate.supports(dt.platform),
    );

    if (!provider || !provider.isConfigured()) {
      this.logger.warn(
        `Push provider for ${dt.platform} is not configured; skipping token ${redact(dt.token)}`,
      );
      return {
        token: dt.token,
        platform: dt.platform,
        success: false,
        skipped: true,
      };
    }

    try {
      await provider.send(dt.token, payload);
      dt.lastUsedAt = new Date();
      await this.tokenRepo.save(dt);
      return { token: dt.token, platform: dt.platform, success: true };
    } catch (error) {
      const failure = error instanceof PushSendError ? error : normalizePushError(error);

      if (failure instanceof InvalidDeviceTokenError) {
        this.logger.warn(`Removing stale ${dt.platform} token ${redact(dt.token)}`);
        await this.tokenRepo.delete({ token: dt.token });
        return {
          token: dt.token,
          platform: dt.platform,
          success: false,
          error: failure.message,
        };
      }

      if (failure.retryable) {
        this.logger.warn(
          `Transient push failure for ${dt.platform} token ${redact(dt.token)}: ${failure.message}`,
        );
        return {
          token: dt.token,
          platform: dt.platform,
          success: false,
          retryable: true,
          error: failure.message,
        };
      }

      this.logger.error(
        `Push send failed for ${dt.platform} token ${redact(dt.token)}: ${failure.message}`,
      );
      return {
        token: dt.token,
        platform: dt.platform,
        success: false,
        error: failure.message,
      };
    }
  }
}
