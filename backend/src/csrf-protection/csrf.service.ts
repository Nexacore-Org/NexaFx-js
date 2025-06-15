import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CsrfService {
  private readonly tokenStore = new Map<string, { token: string; expires: number }>();
  private readonly TOKEN_EXPIRY = 3600000; // 1 hour

  generateToken(sessionId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + this.TOKEN_EXPIRY;
    
    this.tokenStore.set(sessionId, { token, expires });
    
    return token;
  }

  validateToken(sessionId: string, providedToken: string): boolean {
    const stored = this.tokenStore.get(sessionId);
    
    if (!stored) {
      return false;
    }

    if (Date.now() > stored.expires) {
      this.tokenStore.delete(sessionId);
      return false;
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(stored.token, 'hex'),
      Buffer.from(providedToken, 'hex')
    );

    if (isValid) {
      // Token is single-use, remove after validation
      this.tokenStore.delete(sessionId);
    }

    return isValid;
  }

  cleanExpiredTokens(): void {
    const now = Date.now();
    for (const [sessionId, data] of this.tokenStore.entries()) {
      if (now > data.expires) {
        this.tokenStore.delete(sessionId);
      }
    }
  }
}