import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

/**
 * RFC 6238 TOTP implementation using Node.js built-in crypto.
 * Compatible with Google Authenticator, Authy, and other standard TOTP apps.
 */
@Injectable()
export class TotpService {
  private readonly STEP = 30; // seconds
  private readonly DIGITS = 6;
  private readonly WINDOW = 1; // ±1 step tolerance

  /** Generate a random base32-encoded TOTP secret. */
  generateSecret(): string {
    const bytes = crypto.randomBytes(20);
    return this.base32Encode(bytes);
  }

  /** Build a TOTP URI for QR code generation. */
  buildQrUri(secret: string, email: string, issuer = 'NexaFx'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedEmail = encodeURIComponent(email);
    return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${this.DIGITS}&period=${this.STEP}`;
  }

  /** Verify a TOTP code with ±WINDOW step tolerance. */
  verify(secret: string, token: string): boolean {
    const counter = Math.floor(Date.now() / 1000 / this.STEP);
    for (let delta = -this.WINDOW; delta <= this.WINDOW; delta++) {
      if (this.generateTotp(secret, counter + delta) === token) {
        return true;
      }
    }
    return false;
  }

  /** Generate 10 single-use backup codes. */
  generateBackupCodes(): string[] {
    return Array.from({ length: 10 }, () =>
      crypto.randomBytes(5).toString('hex').toUpperCase(),
    );
  }

  /** Hash a backup code for storage. */
  hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');
  }

  /** Verify and consume a backup code from the hashed list. Returns updated list or null if invalid. */
  consumeBackupCode(code: string, hashedCodes: string[]): string[] | null {
    const hash = this.hashBackupCode(code);
    const idx = hashedCodes.indexOf(hash);
    if (idx === -1) return null;
    const updated = [...hashedCodes];
    updated.splice(idx, 1);
    return updated;
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private generateTotp(secret: string, counter: number): string {
    const key = this.base32Decode(secret);
    const buf = Buffer.alloc(8);
    let tmp = counter;
    for (let i = 7; i >= 0; i--) {
      buf[i] = tmp & 0xff;
      tmp >>= 8;
    }
    const hmac = crypto.createHmac('sha1', key).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const code =
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff);
    return String(code % 10 ** this.DIGITS).padStart(this.DIGITS, '0');
  }

  private base32Encode(buf: Buffer): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let result = '';
    let bits = 0;
    let value = 0;
    for (const byte of buf) {
      value = (value << 8) | byte;
      bits += 8;
      while (bits >= 5) {
        result += alphabet[(value >>> (bits - 5)) & 31];
        bits -= 5;
      }
    }
    if (bits > 0) {
      result += alphabet[(value << (5 - bits)) & 31];
    }
    return result;
  }

  private base32Decode(str: string): Buffer {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const clean = str.toUpperCase().replace(/=+$/, '');
    let bits = 0;
    let value = 0;
    const output: number[] = [];
    for (const char of clean) {
      const idx = alphabet.indexOf(char);
      if (idx === -1) continue;
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) {
        output.push((value >>> (bits - 8)) & 255);
        bits -= 8;
      }
    }
    return Buffer.from(output);
  }
}
