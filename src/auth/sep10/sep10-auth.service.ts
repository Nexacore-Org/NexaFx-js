import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createHash, createPublicKey, createVerify } from 'crypto';

const CHALLENGE_TTL_MS = 600_000;
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
      const publicKeyBytes = this.base64ToBuffer(publicKey);
      const signatureBytes = this.base64ToBuffer(signatureB64);
      const messageBytes = Buffer.from(challenge.challengePayload, 'utf8');

      if (publicKeyBytes.length !== 32) {
        throw new UnauthorizedException('Invalid public key length');
      }
      if (signatureBytes.length !== 64) {
        throw new UnauthorizedException('Invalid signature length');
      }

      const spkiKey = Buffer.concat([
        Buffer.from('302a300506032b6570032100', 'hex'),
        publicKeyBytes,
      ]);

      const keyObject = createPublicKey({
        key: spkiKey,
        format: 'der',
        type: 'spki',
      });

      const messageHash = createHash('sha512').update(messageBytes).digest();
      const verifier = createVerify('SHA512');
      verifier.update(messageHash);
      const valid = verifier.verify(keyObject, signatureBytes);

      return valid;
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
