import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { AuditService } from '../audit/audit.service';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';

describe('WalletsController', () => {
  const getBalancesForAccountMock = jest.fn();
  const adjustBalanceMock = jest.fn();
  const walletsService = {
    getBalancesForAccount: getBalancesForAccountMock,
    adjustBalance: adjustBalanceMock,
  } as unknown as WalletsService;
  const logMock = jest.fn().mockResolvedValue(undefined);
  const auditService = { log: logMock } as unknown as AuditService;
  const controller = new WalletsController(walletsService, auditService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns balances for a single account', () => {
    getBalancesForAccountMock.mockReturnValue([
      { accountId: 'acct-1', currency: 'USD', balance: 12 },
    ]);

    expect(controller.getBalances('acct-1')).toEqual([
      { accountId: 'acct-1', currency: 'USD', balance: 12 },
    ]);
    expect(getBalancesForAccountMock).toHaveBeenCalledWith('acct-1');
  });

  it('uses the DTO payload for balance adjustments and audits the acting admin', async () => {
    adjustBalanceMock.mockReturnValue({
      accountId: 'acct-1',
      currency: 'USD',
      balance: 50,
    });

    await expect(
      controller.adjustBalance(
        { accountId: 'acct-1', currency: 'USD', delta: 50 },
        { user: { sub: 'admin-1' } },
      ),
    ).resolves.toEqual({ accountId: 'acct-1', currency: 'USD', balance: 50 });
    expect(adjustBalanceMock).toHaveBeenCalledWith('acct-1', 'USD', 50);
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'admin-1',
        action: 'wallet.balance_adjusted',
        entityId: 'acct-1',
      }),
    );
  });

  it('restricts adjust-balance to admins and rejects a non-admin caller', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      WalletsController.prototype.adjustBalance,
    );
    expect(guards).toContain(AdminRoleGuard);

    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user: { sub: 'u1', role: 'user' } }) }),
    } as any;
    expect(() => new AdminRoleGuard().canActivate(ctx)).toThrow(ForbiddenException);
    expect(adjustBalanceMock).not.toHaveBeenCalled();
  });
});
