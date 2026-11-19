import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ApiKeyAuthService } from './services/api-key-auth.service';
import { ApiKeysController } from './controllers/api-keys.controller';
import { ApiKeyScope, API_KEY_ALLOWED, API_KEY_REQUIRED_SCOPES } from './api-key-scopes';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { WalletsController } from '../../wallet/wallets.controller';
import { TransactionsController } from '../../transactions/transactions.controller';

/** Issue #1525: API keys are capped to role "user", honour freezes/suspension, and real routes use scopes. */
const ADMIN_OWNER = { id: 'admin-1', email: 'a@b.c', role: 'admin', isActive: true };

function build(opts: { owner?: any; allowed?: boolean; frozen?: boolean } = {}) {
  const key = { id: 'k1', userId: 'admin-1', scopes: [ApiKeyScope.READ_BALANCES], rateLimit: 100 };
  const keys = { validateApiKey: jest.fn().mockResolvedValue(key) };
  const users = { findOne: jest.fn().mockResolvedValue(opts.owner ?? ADMIN_OWNER) };
  const status = { isAllowedToAuthenticate: jest.fn().mockResolvedValue(opts.allowed ?? true) };
  const freeze = { isAccountFrozen: jest.fn().mockResolvedValue(opts.frozen ?? false) };
  return new ApiKeyAuthService(keys as any, users as any, status as any, freeze as any);
}

describe('ApiKeyAuthService principal (issue #1525)', () => {
  it('never inherits the owner\'s admin role', async () => {
    const principal = await build().authenticate('nxf_x', [ApiKeyScope.READ_BALANCES]);

    expect(principal.role).toBe('user');
    expect(principal.authMethod).toBe('api_key');
  });

  it('an admin-owned key cannot pass the admin role guard', async () => {
    const principal = await build().authenticate('nxf_x');
    const context = { switchToHttp: () => ({ getRequest: () => ({ user: principal }) }) } as unknown as ExecutionContext;

    expect(() => new AdminRoleGuard().canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects keys whose owner is suspended or deactivated (same status check as JWTs)', async () => {
    await expect(build({ allowed: false }).authenticate('nxf_x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects keys whose owner is frozen', async () => {
    await expect(build({ frozen: true }).authenticate('nxf_x')).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('API key routes (issue #1525)', () => {
  const scopesOf = (handler: object) => Reflect.getMetadata(API_KEY_REQUIRED_SCOPES, handler);
  const allowedOn = (handler: object) => Reflect.getMetadata(API_KEY_ALLOWED, handler);

  it('balance read requires read:balances', () => {
    expect(allowedOn(WalletsController.prototype.getBalances)).toBe(true);
    expect(scopesOf(WalletsController.prototype.getBalances)).toEqual([ApiKeyScope.READ_BALANCES]);
  });

  it('transaction history requires read:transactions', () => {
    expect(allowedOn(TransactionsController.prototype.findAll)).toBe(true);
    expect(scopesOf(TransactionsController.prototype.findAll)).toEqual([ApiKeyScope.READ_TRANSACTIONS]);
  });

  it('transfers require write:transfers and stay idempotent', () => {
    expect(scopesOf(TransactionsController.prototype.transfer)).toEqual([ApiKeyScope.WRITE_TRANSFERS]);
    expect(Reflect.getMetadata('__guards__', TransactionsController.prototype.transfer)).toBeDefined();
  });

  it('admin accounts cannot mint write-scoped keys', async () => {
    const service = { createApiKey: jest.fn() };
    const controller = new ApiKeysController(service as any);

    await expect(
      controller.create({ name: 'x', scopes: [ApiKeyScope.WRITE_TRANSFERS] } as any, { user: { id: 'a', role: 'admin' } }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createApiKey).not.toHaveBeenCalled();
  });
});
