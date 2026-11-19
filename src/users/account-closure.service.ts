import {
  ConflictException,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ApiKeyEntity } from '../modules/api-keys/entities/api-key.entity';
import { ScheduledTransaction } from '../modules/scheduled-transactions/scheduled-transaction.entity';
import { DisputeEntity } from '../disputes/entities/dispute.entity';
import { DisputeStatus } from '../disputes/dispute.entity';
import { Transaction, TransactionStatus } from '../transactions/transaction.entity';
import { TOKEN_VERSION_CHANGED_EVENT } from '../auth/token-version.service';
import { USER_ACCESS_CHANGED_EVENT, UserAccessChangedEvent } from '../auth/account-status.service';
import { AccountFreezeService } from '../modules/account-freeze/services/account-freeze.service';
import { UsersService } from './users.service';
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

/** Wrong-password attempts on closure share the login lockout policy. */
const CLOSURE_MAX_FAILED_ATTEMPTS = 5;
const CLOSURE_LOCKOUT_MINUTES = 30;

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
    @Optional() private readonly usersService?: UsersService,
    @Optional() private readonly accountFreeze?: AccountFreezeService,
    @Optional() private readonly events?: EventEmitter2,
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
      // A stolen access token must not be a free password-guessing oracle (issue #1530): wrong
      // attempts count against the same lockout counter the login endpoint uses.
      await this.usersService?.recordFailedLogin(user.id, CLOSURE_MAX_FAILED_ATTEMPTS, CLOSURE_LOCKOUT_MINUTES);
      throw new UnauthorizedException('Invalid password');
    }

    await this.assertCanClose(user.id);

    const now = new Date();
    const piiPurgeAt = this.buildPiiPurgeDate(now);

    // Everything that makes the closure real happens together or not at all.
    await this.usersRepository.manager.transaction(async (manager) => {
      await manager.update(User, user.id, {
        isActive: false,
        closedAt: now,
        piiPurgeAt,
        // Invalidates every access token already issued: they stop working immediately.
        tokenVersion: (user.tokenVersion ?? 0) + 1,
      });
      // Soft delete sets deletedAt; the row (and its transactions, ledger and KYC
      // history) stays for the retention period.
      await manager.softDelete(User, user.id);
      // Nothing may act for a closed account.
      await manager.update(ApiKeyEntity, { userId: user.id, isActive: true }, { isActive: false });
      await manager.update(
        ScheduledTransaction,
        { userId: user.id, status: In(['ACTIVE', 'PAUSED']) },
        { status: 'CANCELLED' },
      );
    });

    await this.refreshTokens.revokeUserTokens(user.id);
    this.events?.emit(TOKEN_VERSION_CHANGED_EVENT, { userId: user.id });
    const accessChanged: UserAccessChangedEvent = { userId: user.id, reason: 'deactivated', revokeTokens: true };
    this.events?.emit(USER_ACCESS_CHANGED_EVENT, accessChanged);

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

  /**
   * Closing is irreversible, so it is refused while something is still in flight, and a frozen
   * account can never be closed (that would let a user escape an investigation).
   */
  private async assertCanClose(userId: string): Promise<void> {
    if (this.accountFreeze && (await this.accountFreeze.isAccountFrozen(userId))) {
      throw new ConflictException('A frozen account cannot be closed');
    }

    await this.assertZeroBalance(userId);

    const manager = this.usersRepository.manager;
    const openDisputes = await manager.count(DisputeEntity, {
      where: { userId, status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]) },
    });
    if (openDisputes > 0) {
      throw new ConflictException('Resolve your open disputes before closing the account');
    }

    const pendingTransactions = await manager.count(Transaction, {
      where: [
        { senderId: userId, status: TransactionStatus.PENDING },
        { receiverId: userId, status: TransactionStatus.PENDING },
      ],
    });
    if (pendingTransactions > 0) {
      throw new ConflictException('Wait for pending transactions to finish before closing the account');
    }
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
