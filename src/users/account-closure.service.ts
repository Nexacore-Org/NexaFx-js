import {
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { WalletsService } from '../wallet/wallets.service';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Repository } from 'typeorm';
import { createHmac, pbkdf2Sync, randomBytes, randomUUID } from 'crypto';
import { UserAccount } from './user-account.entity';
import { AccountClosureMailer } from './account-closure.mailer';

interface AccessTokenClaims {
  sub: string;
  familyId: string;
  refreshTokenId: string;
}

interface AccountClosureResult {
  closed: true;
  deletedAt: Date;
  piiPurgeAt: Date;
}

const TWO_FACTOR_TIME_STEP_SECONDS = 30;
const TWO_FACTOR_DIGITS = 6;
const PASSWORD_ITERATIONS = 120000;
const PII_RETENTION_YEARS = 7;

@Injectable()
export class AccountClosureService {
  constructor(
    @InjectRepository(UserAccount)
    private readonly userAccountRepository: Repository<UserAccount>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly walletsService: WalletsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly accountClosureMailer: AccountClosureMailer,
  ) {}

  async closeAccount(
    accessToken: string,
    currentPassword: string,
    twoFactorCode: string,
  ): Promise<AccountClosureResult> {
    if (!currentPassword || !twoFactorCode) {
      throw new UnauthorizedException(
        'Password and 2FA confirmation are required',
      );
    }

    const claims = await this.verifyAccessToken(accessToken);
    const account = await this.userAccountRepository.findOne({
      where: { id: claims.sub },
    });

    if (!account || !account.isActive) {
      throw new UnauthorizedException('Account not found');
    }

    this.assertPassword(account, currentPassword);
    this.assertTwoFactorCode(account.twoFactorSecret, twoFactorCode);
    this.assertZeroBalance(account.id);

    const now = new Date();
    const piiPurgeAt = this.buildPiiPurgeDate(now);

    account.isActive = false;
    account.deletedAt = now;
    account.closedAt = now;
    account.piiPurgeAt = piiPurgeAt;

    await this.userAccountRepository.save(account);

    await this.refreshTokenRepository.update(
      { userId: account.id },
      {
        revokedAt: now,
      },
    );

    try {
      await this.accountClosureMailer.sendFinalConfirmation(
        account.email,
        account.displayName,
      );
      account.finalEmailSentAt = new Date();
      await this.userAccountRepository.save(account);
    } catch {
      // The account remains closed even if email delivery fails.
    }

    return {
      closed: true,
      deletedAt: now,
      piiPurgeAt,
    };
  }

  async findActiveAccountById(accountId: string): Promise<UserAccount | null> {
    return this.userAccountRepository.findOne({
      where: { id: accountId, isActive: true },
    });
  }

  async createAccount(input: {
    email: string;
    displayName: string;
    password: string;
    twoFactorSecret?: string;
  }): Promise<UserAccount> {
    const passwordSalt = randomBytes(16).toString('hex');
    const twoFactorSecret =
      input.twoFactorSecret ?? randomBytes(20).toString('hex');
    const account = this.userAccountRepository.create({
      id: randomUUID(),
      email: input.email,
      displayName: input.displayName,
      passwordSalt,
      passwordHash: this.hashPassword(input.password, passwordSalt),
      twoFactorSecret,
      isActive: true,
      deletedAt: null,
      closedAt: null,
      piiPurgeAt: null,
      piiPurgedAt: null,
      finalEmailSentAt: null,
    });

    return this.userAccountRepository.save(account);
  }

  private async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    try {
      return await this.jwtService.verifyAsync<AccessTokenClaims>(token, {
        secret: this.configService.get<string>('jwt.secret') ?? '',
      });
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }
  }

  private assertPassword(account: UserAccount, currentPassword: string): void {
    const nextHash = this.hashPassword(currentPassword, account.passwordSalt);
    if (nextHash !== account.passwordHash) {
      throw new UnauthorizedException('Invalid password');
    }
  }

  private assertTwoFactorCode(secret: string, code: string): void {
    if (!this.isTwoFactorCodeValid(secret, code)) {
      throw new UnauthorizedException('Invalid two-factor code');
    }
  }

  private assertZeroBalance(accountId: string): void {
    const balances = this.walletsService.getBalancesForAccount(accountId);
    const hasFunds = balances.some((balance) => balance.balance !== 0);

    if (hasFunds) {
      throw new UnprocessableEntityException(
        'Account balance must be zero before closure',
      );
    }
  }

  private buildPiiPurgeDate(referenceDate: Date): Date {
    const purgeDate = new Date(referenceDate);
    purgeDate.setFullYear(purgeDate.getFullYear() + PII_RETENTION_YEARS);
    return purgeDate;
  }

  private hashPassword(password: string, salt: string): string {
    return pbkdf2Sync(
      password,
      salt,
      PASSWORD_ITERATIONS,
      64,
      'sha512',
    ).toString('hex');
  }

  private isTwoFactorCodeValid(secret: string, code: string): boolean {
    const normalizedCode = code.trim();
    if (!/^\d{6}$/.test(normalizedCode)) {
      return false;
    }

    const currentWindow = Math.floor(
      Date.now() / 1000 / TWO_FACTOR_TIME_STEP_SECONDS,
    );
    const windowsToCheck = [
      currentWindow - 1,
      currentWindow,
      currentWindow + 1,
    ];

    return windowsToCheck.some(
      (window) => this.generateTwoFactorCode(secret, window) === normalizedCode,
    );
  }

  private generateTwoFactorCode(secret: string, window: number): string {
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(window));
    const hmac = createHmac('sha1', Buffer.from(secret, 'hex'))
      .update(counterBuffer)
      .digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binaryCode = hmac.readUInt32BE(offset) & 0x7fffffff;
    return (binaryCode % 10 ** TWO_FACTOR_DIGITS)
      .toString()
      .padStart(TWO_FACTOR_DIGITS, '0');
  }
}
