import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DeviceToken, DevicePlatform } from '../device-token.entity';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

const MAX_TOKENS_PER_USER = 20;

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private readonly tokenRepo: Repository<DeviceToken>,
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

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

  async deregisterToken(token: string): Promise<void> {
    await this.tokenRepo.delete({ token });
  }

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const tokens = await this.tokenRepo.find({ where: { userId } });
    await Promise.all(tokens.map((dt) => this.send(dt, payload)));
  }

  private async send(dt: DeviceToken, payload: PushPayload): Promise<void> {
    try {
      if (dt.platform === DevicePlatform.IOS) {
        await this.sendApns(dt.token, payload);
      } else {
        await this.sendFcm(dt.token, payload);
      }
      dt.lastUsedAt = new Date();
      await this.tokenRepo.save(dt);
    } catch (err: unknown) {
      const anyErr = err as {
        response?: { data?: { error?: string; results?: Array<{ error?: string }> } };
        message?: string;
      };
      if (
        anyErr?.response?.data?.error === 'NotRegistered' ||
        anyErr?.response?.data?.results?.[0]?.error === 'NotRegistered'
      ) {
        this.logger.warn(`Removing stale token: ${dt.token}`);
        await this.tokenRepo.delete({ token: dt.token });
      } else {
        this.logger.error(`Push send failed: ${anyErr?.message ?? 'unknown error'}`);
      }
    }
  }

  private async sendFcm(token: string, payload: PushPayload): Promise<void> {
    const serverKey = this.config.get<string>('push.fcmServerKey');
    await firstValueFrom(
      this.http.post(
        'https://fcm.googleapis.com/fcm/send',
        {
          to: token,
          notification: { title: payload.title, body: payload.body },
          data: payload.data,
        },
        { headers: { Authorization: `key=${serverKey}` } },
      ),
    );
  }

  private async sendApns(token: string, payload: PushPayload): Promise<void> {
    const bundleId = this.config.get<string>('push.apnsBundleId');
    this.logger.log(
      `APNs send to ${token} for bundle ${bundleId}: ${payload.title}`,
    );
  }
}
