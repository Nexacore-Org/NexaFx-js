import {
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { PasswordService } from '../auth/password.service';
import { RefreshTokensService } from '../tokens/refresh-tokens.service';
import { WalletsService } from '../wallet/wallets.service';
import { AuditService } from '../audit/audit.service';
import { AccountClosureMailer } from './account-closure.mailer';

export interface AccountClosureResult {
  closed: true;
  deletedAt: Date;
  piiPurgeAt: Date;
}

/** Personal data is kept this long after closure, then anonymised (see the purge job). */
export const PII_RETENTION_YEARS = 7;

/**
 * Close the caller's own account on the real `users` table: verify the
 * password, require a zero balance, soft-delete, revoke sessions and audit.
 * There is no 2FA service in this codebase yet, so the password is the
 * confirmation factor; wire a real second factor in here when one exists.
 */
@Injectable()
export class AccountClosureService {
  private readonly logger = new Logger(AccountClosureService.name);

  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly passwordService: PasswordService,
    private readonly walletsService: WalletsService,
    private readonly refreshTokens: RefreshTokensService,
    private readonly mailer: AccountClosureMailer,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async closeAccount(userId: string, currentPassword: string): Promise<AccountClosureResult> {
    if (!userId || !currentPassword) {
      throw new UnauthorizedException('Password confirmation is required');
    }

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Account not found');
    }

    // bcrypt.compare is constant-time; legacy non-bcrypt hashes cannot be closed here.
    const passwordOk =
      user.passwordHash.startsWith('$') &&
      (await this.passwordService.verify(currentPassword, user.passwordHash));
    if (!passwordOk) {
      throw new UnauthorizedException('Invalid password');
    }

    await this.assertZeroBalance(user.id);

    const now = new Date();
    const piiPurgeAt = this.buildPiiPurgeDate(now);

    await this.usersRepository.update(user.id, {
      isActive: false,
      closedAt: now,
      piiPurgeAt,
    });
    // Soft delete sets deletedAt; the row (and its transactions, ledger and KYC
    // history) stays for the retention period.
    await this.usersRepository.softDelete(user.id);

    await this.refreshTokens.revokeUserTokens(user.id);

    await this.auditService?.log({
      userId: user.id,
      action: 'account.closed',
      entityType: 'user',
      entityId: user.id,
      after: { closedAt: now.toISOString(), piiPurgeAt: piiPurgeAt.toISOString() },
    });

    try {
      await this.mailer.sendFinalConfirmation(user.email, `${user.firstName} ${user.lastName}`.trim());
    } catch (err) {
      // The account stays closed even if the confirmation email fails.
      this.logger.warn(`Closure confirmation email failed for ${user.id}: ${(err as Error).message}`);
    }

    return { closed: true, deletedAt: now, piiPurgeAt };
  }

  private async assertZeroBalance(userId: string): Promise<void> {
    const balances = await this.walletsService.getBalancesForAccount(userId);
    if (balances.some((balance) => Number(balance.balance) !== 0)) {
      throw new UnprocessableEntityException('Account balance must be zero before closure');
    }
  }

  private buildPiiPurgeDate(referenceDate: Date): Date {
    const purgeDate = new Date(referenceDate);
    purgeDate.setFullYear(purgeDate.getFullYear() + PII_RETENTION_YEARS);
    return purgeDate;
  }
}
