import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan } from 'typeorm';
import { EntityManager, Repository, LessThan } from 'typeorm';
import * as crypto from 'crypto';
import { PasswordResetToken } from './password-reset.entity';

const MAX_ATTEMPTS = 3;

/** One message for unknown, used, expired and exhausted tokens: no token-state oracle (issue #1526). */
export const INVALID_RESET_TOKEN_MESSAGE = 'Invalid or expired reset token';
const TOKEN_TTL_MS = 15 * 60 * 1000; // 15 minutes

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    @InjectRepository(PasswordResetToken)
    private readonly tokenRepo: Repository<PasswordResetToken>,
  ) {}

  /**
   * True when the user already has an unused, unexpired token issued within `windowMs`.
   * `forgotPassword` then keeps that link instead of replacing it, so repeated requests
   * cannot keep invalidating the link the owner is trying to use (issue #1527).
   */
  async hasRecentActiveToken(userId: string, windowMs: number): Promise<boolean> {
    const count = await this.tokenRepo.count({
      where: {
        userId,
        used: false,
        expiresAt: MoreThan(new Date()),
        createdAt: MoreThan(new Date(Date.now() - windowMs)),
      },
    });
    return count > 0;
  }

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

  /** Run `fn` in one database transaction (used to claim the token and change the password atomically). */
  runInTransaction<T>(fn: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.tokenRepo.manager.transaction(fn);
  }

  /**
   * Claim a reset token with ONE conditional UPDATE and return its userId. Concurrent requests
   * holding the same token cannot both succeed: the loser's UPDATE matches no row. Unknown, used,
   * expired and over-attempted tokens all fail with the same generic 400 (issue #1526).
   * Call it AFTER validating the new password so a weak password never burns the token.
   */
  async claimToken(rawToken: string, manager?: EntityManager): Promise<string> {
    const repo = manager ? manager.getRepository(PasswordResetToken) : this.tokenRepo;
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const result = await repo
      .createQueryBuilder()
      .update(PasswordResetToken)
      .set({ used: true })
      .where('"tokenHash" = :tokenHash', { tokenHash })
      .andWhere('"used" = false')
      .andWhere('"expiresAt" > now()')
      .andWhere('"attempts" < :max', { max: MAX_ATTEMPTS })
      .returning('"userId"')
      .execute();

    const row = (result.raw as Array<{ userId?: string }> | undefined)?.[0];
    if (result.affected !== 1 || !row?.userId) {
      throw new BadRequestException(INVALID_RESET_TOKEN_MESSAGE);
    }
    return row.userId;
  }

  /**
   * Validate a raw token and return the userId.
   * @deprecated Counts an attempt without claiming the token. `PasswordResetFlowService` uses
   * `claimToken`; this remains only for callers that need the old attempt-counting behaviour.
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
