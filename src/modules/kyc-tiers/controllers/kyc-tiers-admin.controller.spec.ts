import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { KycTiersAdminController } from './kyc-tiers-admin.controller';

const contextFor = (role?: string) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }) }) as unknown as ExecutionContext;

describe('KycTiersAdminController guards (issue #1522)', () => {
  it('is protected by AdminGuard', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, KycTiersAdminController);
    expect(guards).toContain(AdminGuard);
  });

  it('a non-admin gets 403', () => {
    expect(() => new AdminGuard().canActivate(contextFor('user'))).toThrow(ForbiddenException);
    expect(() => new AdminGuard().canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('an admin passes', () => {
    expect(new AdminGuard().canActivate(contextFor('admin'))).toBe(true);
  });

  it('approve and reject delegate with the authenticated admin id', async () => {
    const service = { approve: jest.fn().mockResolvedValue({}), reject: jest.fn().mockResolvedValue({}) };
    const controller = new KycTiersAdminController(service as any);

    await controller.approve('req-1', 'admin-1');
    await controller.reject('req-1', 'admin-1', { reason: 'no' } as any);

    expect(service.approve).toHaveBeenCalledWith('req-1', 'admin-1');
    expect(service.reject).toHaveBeenCalledWith('req-1', 'admin-1', 'no');
  });
});
