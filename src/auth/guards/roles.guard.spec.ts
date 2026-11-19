import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import { RolesGuard } from './roles.guard';

const ctx = (user: unknown) =>
  ({
    getHandler: () => 'h',
    getClass: () => 'c',
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardFor = (required: Role[] | undefined) =>
  new RolesGuard({ getAllAndOverride: jest.fn().mockReturnValue(required) } as unknown as Reflector);

describe('RolesGuard (issue #1537)', () => {
  it('lets everyone through a route without @Roles', () => {
    expect(guardFor(undefined).canActivate(ctx({ role: 'user' }))).toBe(true);
    expect(guardFor([]).canActivate(ctx(undefined))).toBe(true);
  });

  it('allows a role that is listed', () => {
    expect(guardFor([Role.ADMIN, Role.COMPLIANCE]).canActivate(ctx({ role: 'compliance' }))).toBe(true);
  });

  it('refuses a role that is not listed', () => {
    expect(() => guardFor([Role.ADMIN]).canActivate(ctx({ role: 'user' }))).toThrow(ForbiddenException);
  });

  it('refuses an anonymous request on a protected route', () => {
    expect(() => guardFor([Role.ADMIN]).canActivate(ctx(undefined))).toThrow(ForbiddenException);
import { RolesGuard } from './roles.guard';
import { Roles } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';

class Controller {
  @Roles(Role.ADMIN, Role.COMPLIANCE)
  review() {}

  open() {}
}

const contextFor = (handler: 'review' | 'open', user?: { role?: string }) =>
  ({
    getHandler: () => Controller.prototype[handler],
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  it('allows routes without @Roles metadata', () => {
    expect(guard.canActivate(contextFor('open'))).toBe(true);
  });

  it.each([Role.ADMIN, Role.COMPLIANCE])('allows the %s role', (role) => {
    expect(guard.canActivate(contextFor('review', { role }))).toBe(true);
  });

  it('refuses a plain user', () => {
    expect(() => guard.canActivate(contextFor('review', { role: Role.USER }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses when there is no authenticated user', () => {
    expect(() => guard.canActivate(contextFor('review'))).toThrow(ForbiddenException);
  });
});
