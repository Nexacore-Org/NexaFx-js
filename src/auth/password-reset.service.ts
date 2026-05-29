import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { PasswordResetToken } from './password-reset.entity';

const MAX_ATTEMPTS = 3;
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
  ) {}

  /** Generate a reset token for the given userId and return the raw token. */
  async createResetToken(userId: string): Promise<string> {
    // Invalidate any existing tokens for this user
    await this.tokenRepo.delete({ userId, used: false });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await this.tokenRepo.save(
      this.tokenRepo.create({ userId, tokenHash, expiresAt }),
    );

    return rawToken;
  }

  /**
   * Validate a raw token and return the userId.
   * Increments attempt counter; throws after MAX_ATTEMPTS.
   */
  async validateToken(rawToken: string): Promise<string> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const record = await this.tokenRepo.findOne({ where: { tokenHash } });

    if (!record) {
      throw new NotFoundException('Invalid or expired reset token');
    }

    if (record.used) {
      throw new BadRequestException('Token has already been used');
    }

    if (record.expiresAt < new Date()) {
      await this.tokenRepo.delete(record.id);
      throw new BadRequestException('Reset token has expired');
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.tokenRepo.delete(record.id);
      throw new BadRequestException(
        'Too many attempts. Please request a new reset link.',
      );
    }

    // Increment attempt counter
    await this.tokenRepo.update(record.id, {
      attempts: record.attempts + 1,
    });

    return record.userId;
  }

  /** Mark token as used after a successful password reset. */
  async consumeToken(rawToken: string): Promise<void> {
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    await this.tokenRepo.update({ tokenHash }, { used: true });
  }

  /** Cleanup expired tokens (can be called by a scheduled job). */
  async purgeExpiredTokens(): Promise<void> {
    await this.tokenRepo.delete({ expiresAt: LessThan(new Date()) });
  }
}
