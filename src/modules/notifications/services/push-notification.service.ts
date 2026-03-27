import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { DeviceTokenEntity, DevicePlatform } from '../entities/device-token.entity';

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
  urgency?: 'normal' | 'high';
}

export interface PushDeliveryResult {
  success: boolean;
  tokenId: string;
  provider: 'fcm' | 'apns';
  error?: string;
}

const MAX_TOKENS_PER_USER = 5;

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    @InjectRepository(DeviceTokenEntity)
    private readonly tokenRepo: Repository<DeviceTokenEntity>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a device token for a user. Enforces max 5 tokens per user.
   * If the token already exists for this user it is re-activated.
   */
  async registerToken(
    userId: string,
    token: string,
    platform: DevicePlatform,
    deviceName?: string,
  ): Promise<DeviceTokenEntity> {
    // Idempotent — if the exact token already exists, re-activate it
    const existing = await this.tokenRepo.findOne({ where: { token } });
    if (existing) {
      if (existing.userId !== userId) {
        // Token belongs to a different user — remove it and continue
        await this.tokenRepo.remove(existing);
      } else {
        existing.isActive = true;
        existing.platform = platform;
        if (deviceName) existing.deviceName = deviceName;
        return this.tokenRepo.save(existing);
      }
    }

    // Enforce per-user token limit
    const userTokenCount = await this.tokenRepo.count({
      where: { userId, isActive: true },
    });

    if (userTokenCount >= MAX_TOKENS_PER_USER) {
      throw new BadRequestException(
        `Maximum of ${MAX_TOKENS_PER_USER} device tokens allowed per user`,
      );
    }

    const entity = this.tokenRepo.create({ userId, token, platform, deviceName, isActive: true });
    return this.tokenRepo.save(entity);
  }

  /**
   * Unregister a specific token for a user.
   */
  async unregisterToken(userId: string, token: string): Promise<void> {
    const entity = await this.tokenRepo.findOne({ where: { token, userId } });
    if (!entity) {
      throw new NotFoundException('Device token not found');
    }
    await this.tokenRepo.remove(entity);
  }

  /**
   * Send a push notification to all active tokens for a user.
   * Invalid tokens (provider returns 404) are removed immediately.
   */
  async sendToUser(userId: string, message: PushMessage): Promise<PushDeliveryResult[]> {
    const tokens = await this.tokenRepo.find({ where: { userId, isActive: true } });
    if (tokens.length === 0) return [];

    const results = await Promise.all(
      tokens.map((t) => this.deliverToToken(t, message)),
    );
    return results;
  }

  /**
   * Deliver to a single device token. Removes the token if the provider
   * returns a 404 (token no longer valid).
   */
  private async deliverToToken(
    tokenEntity: DeviceTokenEntity,
    message: PushMessage,
  ): Promise<PushDeliveryResult> {
    const provider = tokenEntity.platform === 'android' ? 'fcm' : 'apns';

    try {
      if (tokenEntity.platform === 'android') {
        await this.sendFcm(tokenEntity.token, message);
      } else {
        await this.sendApns(tokenEntity.token, message);
      }

      this.logger.debug(
        `Push sent via ${provider} to token ${tokenEntity.id} for user ${tokenEntity.userId}`,
      );
      return { success: true, tokenId: tokenEntity.id, provider };
    } catch (err: any) {
      const isInvalidToken =
        err?.statusCode === 404 ||
        err?.code === 'messaging/registration-token-not-registered' ||
        err?.reason === 'Unregistered' ||
        err?.reason === 'BadDeviceToken';

      if (isInvalidToken) {
        this.logger.warn(
          `Invalid token ${tokenEntity.id} — removing immediately (no retry)`,
        );
        await this.tokenRepo.remove(tokenEntity);
      }

      return { success: false, tokenId: tokenEntity.id, provider, error: err?.message ?? String(err) };
    }
  }

  /**
   * Send via Firebase Cloud Messaging (Android).
   * Credentials loaded from ConfigService — never hardcoded.
   */
  private async sendFcm(token: string, message: PushMessage): Promise<void> {
    const serverKey = this.configService.get<string>('push.fcmServerKey');
    if (!serverKey) {
      this.logger.warn('FCM_SERVER_KEY not configured — skipping FCM delivery');
      return;
    }

    const priority = message.urgency === 'high' ? 'high' : 'normal';

    const payload = {
      to: token,
      priority,
      notification: {
        title: message.title,
        body: message.body,
      },
      data: message.data ?? {},
    };

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${serverKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      const err: any = new Error(`FCM request failed: ${response.status} ${text}`);
      if (response.status === 404) err.statusCode = 404;
      throw err;
    }

    const json: any = await response.json();
    if (json.failure > 0) {
      const result = json.results?.[0];
      const err: any = new Error(`FCM delivery failed: ${result?.error}`);
      err.code = result?.error;
      throw err;
    }
  }

  /**
   * Send via Apple Push Notification service (iOS).
   * Uses JWT auth (not certificate). Credentials from ConfigService.
   */
  private async sendApns(token: string, message: PushMessage): Promise<void> {
    const keyId = this.configService.get<string>('push.apnsKeyId');
    const teamId = this.configService.get<string>('push.apnsTeamId');
    const bundleId = this.configService.get<string>('push.apnsBundleId');
    const privateKey = this.configService.get<string>('push.apnsPrivateKey');

    if (!keyId || !teamId || !bundleId || !privateKey) {
      this.logger.warn('APNs credentials not configured — skipping APNs delivery');
      return;
    }

    const jwtToken = await this.buildApnsJwt(privateKey, keyId, teamId);
    const isProduction = this.configService.get<boolean>('app.isProduction');
    const host = isProduction
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';

    const apnsPayload = {
      aps: {
        alert: { title: message.title, body: message.body },
        sound: 'default',
      },
      ...message.data,
    };

    const response = await fetch(`${host}/3/device/${token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `bearer ${jwtToken}`,
        'apns-topic': bundleId,
        'apns-priority': message.urgency === 'high' ? '10' : '5',
      },
      body: JSON.stringify(apnsPayload),
    });

    if (response.status === 410 || response.status === 404) {
      const err: any = new Error('APNs token is no longer valid');
      err.statusCode = 404;
      err.reason = 'Unregistered';
      throw err;
    }

    if (!response.ok) {
      const json: any = await response.json().catch(() => ({}));
      const err: any = new Error(`APNs request failed: ${response.status} ${json.reason}`);
      err.reason = json.reason;
      throw err;
    }
  }

  /**
   * Build an APNs JWT token using ES256 (P-256).
   * This is a minimal implementation without third-party JWT libraries.
   */
  private async buildApnsJwt(
    privateKeyPem: string,
    keyId: string,
    teamId: string,
  ): Promise<string> {
    const issuedAt = Math.floor(Date.now() / 1000);

    const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
    const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: issuedAt })).toString('base64url');
    const signingInput = `${header}.${claims}`;

    // Use Node.js crypto to sign with EC private key
    const { createSign } = await import('crypto');
    const sign = createSign('SHA256');
    sign.update(signingInput);
    const derSignature = sign.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' });
    const signature = derSignature.toString('base64url');

    return `${signingInput}.${signature}`;
  }

  /**
   * List active tokens for a user.
   */
  async getTokensForUser(userId: string): Promise<DeviceTokenEntity[]> {
    return this.tokenRepo.find({ where: { userId, isActive: true } });
  }
}
