import {
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { createHmac, pbkdf2Sync, randomBytes } from 'crypto';
import { WalletsService } from '../wallet/wallets.service';
import { RefreshToken } from '../auth/refresh-token.entity';
import { AccountClosureMailer } from './account-closure.mailer';
import { AccountClosureService } from './account-closure.service';
import { UserAccount } from './user-account.entity';

const PASSWORD_ITERATIONS = 120000;
const TWO_FACTOR_TIME_STEP_SECONDS = 30;
const TWO_FACTOR_DIGITS = 6;

describe('AccountClosureService', () => {
  const accessSecret = 'access-secret';
  const userId = '11111111-1111-1111-1111-111111111111';
  const password = 'correct horse battery staple';
  const passwordSalt = randomBytes(16).toString('hex');
  const twoFactorSecret = randomBytes(20).toString('hex');
  const currentPasswordHash = pbkdf2Sync(
    password,
    passwordSalt,
    PASSWORD_ITERATIONS,
    64,
    'sha512',
  ).toString('hex');

  let userAccountRepository: {
    create: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let refreshTokenRepository: {
    update: jest.Mock;
  };
  let walletsService: {
    getBalancesForAccount: jest.Mock;
  };
  let jwtService: {
    verifyAsync: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let accountClosureMailer: {
    sendFinalConfirmation: jest.Mock;
  };
  let accountClosureService: AccountClosureService;

  beforeEach(() => {
    userAccountRepository = {
      create: jest.fn((value: UserAccount) => value),
      findOne: jest.fn(),
      save: jest.fn((value: UserAccount) => Promise.resolve(value)),
    };

    refreshTokenRepository = {
      update: jest.fn(),
    };

    walletsService = {
      getBalancesForAccount: jest.fn().mockReturnValue([]),
    };

    jwtService = {
      verifyAsync: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string) => (key === 'jwt.secret' ? accessSecret : '')),
    };

    accountClosureMailer = {
      sendFinalConfirmation: jest.fn().mockResolvedValue(undefined),
    };

    accountClosureService = new AccountClosureService(
      userAccountRepository as unknown as Repository<UserAccount>,
      refreshTokenRepository as unknown as Repository<RefreshToken>,
      walletsService as unknown as WalletsService,
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
      accountClosureMailer as unknown as AccountClosureMailer,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const buildTwoFactorCode = (
    secret: string,
    timestamp = Date.now(),
  ): string => {
    const window = Math.floor(timestamp / 1000 / TWO_FACTOR_TIME_STEP_SECONDS);
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
  };

  it('closes an account after password, 2FA, and zero-balance checks pass', async () => {
    const accessToken = 'valid-access-token';
    const now = new Date('2026-05-29T12:00:00.000Z');
    const twoFactorCode = buildTwoFactorCode(twoFactorSecret, now.getTime());
    const account = {
      id: userId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      passwordSalt,
      passwordHash: currentPasswordHash,
      twoFactorSecret,
      isActive: true,
      deletedAt: null,
      closedAt: null,
      piiPurgeAt: null,
      piiPurgedAt: null,
      finalEmailSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserAccount;

    jest.useFakeTimers();
    jest.setSystemTime(now);

    jwtService.verifyAsync.mockResolvedValue({
      sub: userId,
      familyId: '22222222-2222-2222-2222-222222222222',
      refreshTokenId: '33333333-3333-3333-3333-333333333333',
    });
    userAccountRepository.findOne.mockResolvedValue(account);

    const result = await accountClosureService.closeAccount(
      accessToken,
      password,
      twoFactorCode,
    );

    expect(result.closed).toBe(true);
    expect(result.deletedAt).toEqual(now);
    expect(result.piiPurgeAt).toEqual(new Date('2033-05-29T12:00:00.000Z'));
    expect(walletsService.getBalancesForAccount).toHaveBeenCalledWith(userId);
    const [, closureUpdatePayload] = refreshTokenRepository.update.mock
      .calls[0] as [Record<string, string>, Partial<RefreshToken>];
    expect(closureUpdatePayload.revokedAt).toEqual(now);
    expect(accountClosureMailer.sendFinalConfirmation).toHaveBeenCalledWith(
      'user@example.com',
      'Ada Lovelace',
    );
    expect(userAccountRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: userId,
        isActive: false,
        deletedAt: now,
        closedAt: now,
      }),
    );

    jest.useRealTimers();
  });

  it('rejects closure when the wallet has a non-zero balance', async () => {
    const account = {
      id: userId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      passwordSalt,
      passwordHash: currentPasswordHash,
      twoFactorSecret,
      isActive: true,
      deletedAt: null,
      closedAt: null,
      piiPurgeAt: null,
      piiPurgedAt: null,
      finalEmailSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserAccount;

    jwtService.verifyAsync.mockResolvedValue({
      sub: userId,
      familyId: '22222222-2222-2222-2222-222222222222',
      refreshTokenId: '33333333-3333-3333-3333-333333333333',
    });
    userAccountRepository.findOne.mockResolvedValue(account);
    walletsService.getBalancesForAccount.mockReturnValue([
      { accountId: userId, currency: 'USD', balance: 10 },
    ]);

    await expect(
      accountClosureService.closeAccount(
        'valid-access-token',
        password,
        buildTwoFactorCode(twoFactorSecret),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(refreshTokenRepository.update).not.toHaveBeenCalled();
    expect(accountClosureMailer.sendFinalConfirmation).not.toHaveBeenCalled();
  });

  it('rejects closure when the password is invalid', async () => {
    const account = {
      id: userId,
      email: 'user@example.com',
      displayName: 'Ada Lovelace',
      passwordSalt,
      passwordHash: currentPasswordHash,
      twoFactorSecret,
      isActive: true,
      deletedAt: null,
      closedAt: null,
      piiPurgeAt: null,
      piiPurgedAt: null,
      finalEmailSentAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserAccount;

    jwtService.verifyAsync.mockResolvedValue({
      sub: userId,
      familyId: '22222222-2222-2222-2222-222222222222',
      refreshTokenId: '33333333-3333-3333-3333-333333333333',
    });
    userAccountRepository.findOne.mockResolvedValue(account);

    await expect(
      accountClosureService.closeAccount(
        'valid-access-token',
        'wrong password',
        buildTwoFactorCode(twoFactorSecret),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
