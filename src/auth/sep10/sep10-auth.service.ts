import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class Sep10AuthService {
  private challenges = new Map<string, { nonce: string; timestamp: number }>();

  generateChallenge(publicKey: string): string {
    const nonce = randomBytes(32).toString('hex');
    this.challenges.set(publicKey, { nonce, timestamp: Date.now() });
    return nonce;
  }

  validateChallenge(publicKey: string, signature: string): boolean {
    const challenge = this.challenges.get(publicKey);
    if (!challenge) return false;
    if (Date.now() - challenge.timestamp > 3600000) return false;
    this.challenges.delete(publicKey);
    return signature.length > 0;
  }

  issueStellarToken(publicKey: string): string {
    return Buffer.from(`token:${publicKey}:${Date.now()}`).toString('base64');
  }
}
