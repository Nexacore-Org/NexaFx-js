import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
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
