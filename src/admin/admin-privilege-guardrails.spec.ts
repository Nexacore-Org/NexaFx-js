import { BadRequestException, ConflictException, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminService } from './admin.service';
import { UserRole } from '../users/user.entity';
import { TokenVersionGuard } from '../auth/token-version.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../auth/enums/role.enum';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

function build(target: Record<string, unknown> | null, otherAdmins = 1) {
  const user = target && { id: 'target', email: 't@x.com', isActive: true, role: UserRole.ADMIN, tokenVersion: 0, ...target };
  const repo = {
    findOne: jest.fn().mockResolvedValue(user),
    count: jest.fn().mockResolvedValue(otherAdmins),
    save: jest.fn(async (u) => u),
  };
  const audit = { log: jest.fn() };
  const events = { emit: jest.fn() };
  const service = new AdminService(
    repo as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, audit as any, events as any,
  );
  return { service, repo, audit, events, user };
}

describe('role and status guardrails (#1367)', () => {
  it('forbids changing your own role or status', async () => {
    const { service } = build({ id: 'admin-1' });
    await expect(service.updateUserRole('admin-1', UserRole.USER, 'admin-1', 'stepping down')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.updateUserStatus('admin-1', false, 'admin-1', 'x')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses to demote or suspend the last active admin', async () => {
    const { service, repo } = build({}, 0);
    await expect(service.updateUserRole('target', UserRole.USER, 'admin-2', 'cleanup')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.updateUserStatus('target', false, 'admin-2', 'cleanup')).rejects.toBeInstanceOf(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another active admin remains, and bumps the token version', async () => {
    const { service, user, events, audit } = build({}, 1);
    const updated = await service.updateUserRole('target', UserRole.COMPLIANCE, 'admin-2', 'moved to compliance');
    expect(updated.role).toBe(UserRole.COMPLIANCE);
    expect(updated.tokenVersion).toBe(1);
    expect(events.emit).toHaveBeenCalledWith('user.token-version.changed', { userId: 'target' });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ reason: 'moved to compliance' }));
    expect(user).toBeDefined();
  });

  it('requires a reason for role changes', async () => {
    const { service } = build({ role: UserRole.USER });
    await expect(service.updateUserRole('target', UserRole.COMPLIANCE, 'admin-2')).rejects.toBeInstanceOf(BadRequestException);
    expect(await validate(plainToInstance(UpdateUserRoleDto, { role: 'compliance' }))).not.toHaveLength(0);
    expect(await validate(plainToInstance(UpdateUserRoleDto, { role: 'compliance', reason: 'new compliance hire' }))).toHaveLength(0);
  });

  it('suspending a non-admin bumps the token version too', async () => {
    const { service } = build({ role: UserRole.USER });
    const updated = await service.updateUserStatus('target', false, 'admin-2', 'fraud');
    expect(updated.tokenVersion).toBe(1);
  });
});

describe('TokenVersionGuard (#1367)', () => {
  const ctx = (user: unknown) =>
    ({ getType: () => 'http', switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as unknown as ExecutionContext;
  const guard = (current: number | null) =>
    new TokenVersionGuard({ currentVersion: jest.fn().mockResolvedValue(current) } as any);

  it('accepts a token with the current version', async () => {
    await expect(guard(2).canActivate(ctx({ id: 'u', tokenVersion: 2 }))).resolves.toBe(true);
  });

  it('rejects a token issued before a role change', async () => {
    await expect(guard(3).canActivate(ctx({ id: 'u', tokenVersion: 2 }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the user no longer exists, and skips unauthenticated or API-key requests', async () => {
    await expect(guard(null).canActivate(ctx({ id: 'u', tokenVersion: 0 }))).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(5).canActivate(ctx(undefined))).resolves.toBe(true);
    await expect(guard(5).canActivate(ctx({ id: 'u', authMethod: 'api_key' }))).resolves.toBe(true);
  });
});

describe('RolesGuard with the compliance role (#1367)', () => {
  class Controller {
    @Roles(Role.ADMIN, Role.COMPLIANCE)
    review() {}
  }
  const ctxFor = (role: string) =>
    ({
      getHandler: () => Controller.prototype.review,
      getClass: () => Controller,
      switchToHttp: () => ({ getRequest: () => ({ user: { role } }) }),
    }) as unknown as ExecutionContext;
  const guard = new RolesGuard(new Reflector());

  it('lets compliance officers and admins through, and refuses plain users', () => {
    expect(guard.canActivate(ctxFor('compliance'))).toBe(true);
    expect(guard.canActivate(ctxFor('admin'))).toBe(true);
    expect(() => guard.canActivate(ctxFor('user'))).toThrow(ForbiddenException);
  });
});
