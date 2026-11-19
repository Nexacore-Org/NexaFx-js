import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createSign } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { DevicePlatform } from '../device-token.entity';
import {
  normalizePushError,
  PushPayload,
  PushProvider,
} from './push-provider';

interface ServiceAccount {
  client_email?: string;
  private_key?: string;
  project_id?: string;
}

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
}

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_EXPIRY_SKEW_SECONDS = 60;

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** Firebase Cloud Messaging HTTP v1 (the legacy `fcm/send` API is retired). */
@Injectable()
export class FcmV1Provider implements PushProvider {
  readonly name = 'fcm-v1';
  private readonly logger = new Logger(FcmV1Provider.name);
  private accessToken = '';
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  supports(platform: DevicePlatform): boolean {
    return platform === DevicePlatform.ANDROID || platform === DevicePlatform.WEB;
  }

  isConfigured(): boolean {
    const account = this.serviceAccount();
    return !!this.projectId() && !!account?.client_email && !!account.private_key;
  }

  async send(token: string, payload: PushPayload): Promise<void> {
    try {
      const accessToken = await this.getAccessToken();
      const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
        this.projectId(),
      )}/messages:send`;
      const message = {
        token,
        notification: { title: payload.title, body: payload.body },
        ...(payload.data ? { data: payload.data } : {}),
      };
      await firstValueFrom(
        this.http.post(
          url,
          { message },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    } catch (error) {
      throw normalizePushError(error);
    }
  }

  private configValue(groupedKey: string, envKey: string): string {
    return (
      this.config.get<string>(groupedKey) ||
      this.config.get<string>(envKey) ||
      ''
    );
  }

  private projectId(): string {
    return this.configValue('push.fcmProjectId', 'FCM_PROJECT_ID') ||
      this.serviceAccount()?.project_id ||
      '';
  }

  private serviceAccount(): ServiceAccount | null {
    const raw = this.configValue(
      'push.fcmServiceAccountJson',
      'FCM_SERVICE_ACCOUNT_JSON',
    );
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ServiceAccount;
    } catch {
      this.logger.warn('FCM_SERVICE_ACCOUNT_JSON is not valid JSON');
      return null;
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const account = this.serviceAccount();
    if (!account?.client_email || !account.private_key) {
      throw new Error('FCM service account credentials are missing');
    }

    const assertion = this.signJwt(account);
    const { data } = await firstValueFrom(
      this.http.post<OAuthTokenResponse>(
        OAUTH_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      ),
    );

    if (!data?.access_token) {
      throw new Error('FCM OAuth token response did not contain an access token');
    }
    this.accessToken = data.access_token;
    const lifetime = (data.expires_in ?? 3600) - TOKEN_EXPIRY_SKEW_SECONDS;
    this.tokenExpiresAt = Date.now() + Math.max(30, lifetime) * 1000;
    return this.accessToken;
  }

  private signJwt(account: ServiceAccount): string {
    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256', typ: 'JWT' };
    const claims = {
      iss: account.client_email,
      scope: FCM_SCOPE,
      aud: OAUTH_TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };
    const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
      JSON.stringify(claims),
    )}`;
    const signature = createSign('RSA-SHA256')
      .update(signingInput)
      .sign(account.private_key as string);
    return `${signingInput}.${base64Url(signature)}`;
  }
}
