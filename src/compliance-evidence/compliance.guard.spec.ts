import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ComplianceGuard, COMPLIANCE_ROLES } from './guards/compliance.guard';

const createContext = (user: any): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext);

describe('ComplianceGuard', () => {
  let guard: ComplianceGuard;

  beforeEach(() => {
    guard = new ComplianceGuard(new Reflector());
  });

  it.each(COMPLIANCE_ROLES)(
    'should allow user with role "%s"',
    (role) => {
      expect(guard.canActivate(createContext({ roles: [role] }))).toBe(true);
    },
  );

  it('should allow user with role in roles array', () => {
    expect(guard.canActivate(createContext({ role: 'compliance_officer' }))).toBe(true);
  });

  it('should deny regular user', () => {
    expect(() => guard.canActivate(createContext({ roles: ['user'] }))).toThrow(ForbiddenException);
  });

  it('should deny when user is null', () => {
    expect(() => guard.canActivate(createContext(null))).toThrow(ForbiddenException);
  });

  it('should deny when user has no recognised roles', () => {
    expect(() => guard.canActivate(createContext({ roles: ['moderator'] }))).toThrow(
      ForbiddenException,
    );
  });
});
