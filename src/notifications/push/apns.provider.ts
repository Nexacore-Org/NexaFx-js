import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { createPrivateKey, createSign } from 'crypto';
import { firstValueFrom } from 'rxjs';
import { DevicePlatform } from '../device-token.entity';
import {
  normalizePushError,
  PushPayload,
  PushProvider,
} from './push-provider';

const APNS_URL = 'https://api.push.apple.com/3/device/';
const TOKEN_TTL_SECONDS = 50 * 60; // refresh well before Apple's 60-minute limit

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

/** APNs HTTP/2 provider using token-based (.p8 / ES256) authentication. */
@Injectable()
export class ApnsProvider implements PushProvider {
  readonly name = 'apns';
  private authToken = '';
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {}

  supports(platform: DevicePlatform): boolean {
    return platform === DevicePlatform.IOS;
  }

  isConfigured(): boolean {
    return !!(
      this.keyId() &&
      this.teamId() &&
      this.bundleId() &&
      this.privateKey()
    );
  }

  async send(token: string, payload: PushPayload): Promise<void> {
    try {
      const body = {
        aps: {
          alert: { title: payload.title, body: payload.body },
          sound: 'default',
        },
        ...(payload.data ?? {}),
      };
      await firstValueFrom(
        this.http.post(`${APNS_URL}${encodeURIComponent(token)}`, body, {
          headers: {
            authorization: `bearer ${this.getAuthToken()}`,
            'apns-topic': this.bundleId(),
            'apns-expiration': '0',
          },
        }),
      );
    } catch (error) {
      throw normalizePushError(error);
    }
  }

  private get(groupedKey: string, envKey: string): string {
    return (
      this.config.get<string>(groupedKey) ||
      this.config.get<string>(envKey) ||
      ''
    );
  }

  private keyId(): string {
    return this.get('push.apnsKeyId', 'APNS_KEY_ID');
  }

  private teamId(): string {
    return this.get('push.apnsTeamId', 'APNS_TEAM_ID');
  }

  private bundleId(): string {
    return this.get('push.apnsBundleId', 'APNS_BUNDLE_ID');
  }

  private privateKey(): string {
    return this.get('push.apnsPrivateKey', 'APNS_PRIVATE_KEY');
  }

  private getAuthToken(): string {
    if (this.authToken && Date.now() < this.tokenExpiresAt) {
      return this.authToken;
    }
    const keyId = this.keyId();
    const teamId = this.teamId();
    const privateKey = this.privateKey();
    if (!keyId || !teamId || !privateKey) {
      throw new Error('APNs credentials are missing');
    }

    const now = Math.floor(Date.now() / 1000);
    const header = { alg: 'ES256', kid: keyId };
    const claims = { iss: teamId, iat: now };
    const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
      JSON.stringify(claims),
    )}`;
    // APNs expects the raw r||s signature, not the default DER encoding.
    const signature = createSign('SHA256')
      .update(signingInput)
      .sign({
        key: createPrivateKey(privateKey),
        dsaEncoding: 'ieee-p1363',
      });

    this.authToken = `${signingInput}.${base64Url(signature)}`;
    this.tokenExpiresAt = Date.now() + TOKEN_TTL_SECONDS * 1000;
    return this.authToken;
  }
}
