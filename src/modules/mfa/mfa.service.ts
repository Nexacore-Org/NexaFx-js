// src/modules/auth/mfa/mfa.service.ts
import { Injectable } from '@nestjs/common';
import * as authenticator from 'otplib';

@Injectable()
export class MfaService {
  async generateSecret(userId: string) {
    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userId, 'NexaFx', secret);
    // Store secret encrypted in DB
    return { secret, otpauth };
  }

  async verifyToken(token: string, secret: string): Promise<boolean> {
    return authenticator.check(token, secret);
  }
}