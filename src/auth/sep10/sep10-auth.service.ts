import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createPublicKey, verify as cryptoVerify } from 'crypto';

const CHALLENGE_TTL_MS = 600_000;
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;
// StrKey version byte for an ed25519 public key ("G..." addresses).
const STRKEY_ED25519_PUBLIC_KEY = 6 << 3;
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
// DER SubjectPublicKeyInfo prefix for a raw 32-byte Ed25519 public key.
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const CHALLENGE_CLEANUP_INTERVAL_MS = 60_000;

interface StoredChallenge {
  nonce: string;
  timestamp: number;
  challengePayload: string;
}

@Injectable()
export class Sep10AuthService {
  private readonly logger = new Logger(Sep10AuthService.name);
  private challenges = new Map<string, StoredChallenge>();
  private lastCleanup = Date.now();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  generateChallenge(publicKey: string): { nonce: string; challenge: string } {
    this.maybeCleanup();

    const nonce = randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const challengePayload = ` stellar sep10 auth\npublicKey:${publicKey}\nnonce:${nonce}\ntimestamp:${timestamp}`;

    this.challenges.set(publicKey, { nonce, timestamp, challengePayload });

    return { nonce, challenge: challengePayload };
  }

  validateChallenge(publicKey: string, signatureB64: string): boolean {
    const challenge = this.challenges.get(publicKey);
    if (!challenge) {
      throw new UnauthorizedException('No pending challenge for this public key');
    }

    if (Date.now() - challenge.timestamp > CHALLENGE_TTL_MS) {
      this.challenges.delete(publicKey);
      throw new UnauthorizedException('Challenge expired');
    }

    this.challenges.delete(publicKey);

    try {
      const publicKeyBytes = this.decodePublicKey(publicKey);
      const signatureBytes = this.base64ToBuffer(signatureB64);
      const messageBytes = Buffer.from(challenge.challengePayload, 'utf8');

      if (publicKeyBytes.length !== ED25519_PUBLIC_KEY_BYTES) {
        throw new UnauthorizedException('Invalid public key length');
      }
      if (signatureBytes.length !== ED25519_SIGNATURE_BYTES) {
        throw new UnauthorizedException('Invalid signature length');
      }

      const keyObject = createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, publicKeyBytes]),
        format: 'der',
        type: 'spki',
      });

      // Ed25519 must be verified with the one-shot API and the raw message:
      // the streaming Verify API does not support Ed25519 keys, and Ed25519
      // hashes internally, so a pre-hashed digest would verify the wrong bytes.
      return cryptoVerify(null, messageBytes, keyObject, signatureBytes);
    } catch (err: any) {
      if (err instanceof UnauthorizedException) throw err;
      this.logger.warn(`SEP-10 signature verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid signature');
    }
  }

  issueStellarToken(publicKey: string): string {
    return this.jwtService.sign(
      {
        sub: publicKey,
        type: 'stellar',
      },
      { expiresIn: 3600 },
    );
  }

  private base64ToBuffer(b64: string): Buffer {
    return Buffer.from(b64, 'base64');
  }

  /**
   * Accepts a Stellar account address in StrKey form ("G..."), falling back to
   * a base64-encoded raw 32-byte Ed25519 key for non-Stellar callers.
   */
  private decodePublicKey(publicKey: string): Buffer {
    if (/^G[A-Z2-7]{55}$/.test(publicKey)) {
      return this.decodeStrKey(publicKey);
    }
    return this.base64ToBuffer(publicKey);
  }

  private decodeStrKey(address: string): Buffer {
    const decoded = this.base32Decode(address);

    if (decoded.length !== 1 + ED25519_PUBLIC_KEY_BYTES + 2) {
      throw new UnauthorizedException('Invalid Stellar address');
    }
    if (decoded[0] !== STRKEY_ED25519_PUBLIC_KEY) {
      throw new UnauthorizedException('Invalid Stellar address');
    }

    const payload = decoded.subarray(0, decoded.length - 2);
    const checksum = decoded.readUInt16LE(decoded.length - 2);
    if (checksum !== this.crc16Xmodem(payload)) {
      throw new UnauthorizedException('Invalid Stellar address');
    }

    return Buffer.from(payload.subarray(1));
  }

  private base32Decode(input: string): Buffer {
    let bits = 0;
    let value = 0;
    const output: number[] = [];

    for (const char of input) {
      const index = BASE32_ALPHABET.indexOf(char);
      if (index === -1) {
        throw new UnauthorizedException('Invalid Stellar address');
      }

      value = (value << 5) | index;
      bits += 5;

      if (bits >= 8) {
        bits -= 8;
        output.push((value >>> bits) & 0xff);
      }
    }

    return Buffer.from(output);
  }

  private crc16Xmodem(data: Buffer): number {
    let crc = 0;

    for (const byte of data) {
      crc ^= byte << 8;
      for (let bit = 0; bit < 8; bit++) {
        crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
      }
    }

    return crc;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < CHALLENGE_CLEANUP_INTERVAL_MS) return;
    this.lastCleanup = now;

    for (const [key, challenge] of this.challenges) {
      if (now - challenge.timestamp > CHALLENGE_TTL_MS) {
        this.challenges.delete(key);
      }
    }
  }
}
