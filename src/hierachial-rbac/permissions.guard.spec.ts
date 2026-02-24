import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from '../guards/permissions.guard';
import { PermissionResolutionService } from '../policies/permission-resolution.service';
import { PolicyEvaluatorService } from '../policies/policy-evaluator.service';
import { RbacAuditService } from '../services/rbac-audit.service';
import { PermissionAction, PermissionResource } from '../entities/permission.entity';
import { PERMISSIONS_KEY, POLICY_KEY } from '../decorators/permissions.decorator';

const mockExecutionContext = (user: any, url = '/test', method = 'GET') => {
  const request = { user, url, method, ip: '127.0.0.1', headers: { 'user-agent': 'jest' }, params: {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as any;
};

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: Reflector;
  let resolutionService: any;
  let policyEvaluator: any;
  let auditService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsGuard,
        Reflector,
        {
          provide: PermissionResolutionService,
          useValue: { hasPermissions: jest.fn() },
        },
        {
          provide: PolicyEvaluatorService,
          useValue: { evaluate: jest.fn(), has: jest.fn() },
        },
        {
          provide: RbacAuditService,
          useValue: { log: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    guard = module.get(PermissionsGuard);
    reflector = module.get(Reflector);
    resolutionService = module.get(PermissionResolutionService);
    policyEvaluator = module.get(PolicyEvaluatorService);
    auditService = module.get(RbacAuditService);
  });

  it('allows when no permissions or policies defined', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = mockExecutionContext({ id: 'user-1' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('throws ForbiddenException when no user is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY)
        return [{ action: PermissionAction.READ, resource: PermissionResource.USER }];
      return undefined;
    });

    const ctx = mockExecutionContext(null);
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('allows when user has required permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY)
        return [{ action: PermissionAction.READ, resource: PermissionResource.USER }];
      return undefined;
    });

    resolutionService.hasPermissions.mockResolvedValue(true);
    const ctx = mockExecutionContext({ id: 'user-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_GRANTED' }),
    );
  });

  it('denies and throws ForbiddenException when user lacks permission', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY)
        return [{ action: PermissionAction.DELETE, resource: PermissionResource.ADMIN }];
      return undefined;
    });

    resolutionService.hasPermissions.mockResolvedValue(false);
    const ctx = mockExecutionContext({ id: 'user-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'ACCESS_DENIED' }),
    );
  });

  it('evaluates policy when POLICY_KEY is set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === POLICY_KEY) return { name: 'self-only' };
      return undefined;
    });

    policyEvaluator.evaluate.mockResolvedValue(true);
    const ctx = mockExecutionContext({ id: 'user-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(policyEvaluator.evaluate).toHaveBeenCalledWith('self-only', expect.any(Object));
  });

  it('denies when policy returns false', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === POLICY_KEY) return { name: 'self-only' };
      return undefined;
    });

    policyEvaluator.evaluate.mockResolvedValue(false);
    const ctx = mockExecutionContext({ id: 'user-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('requires BOTH permissions and policy when both are set', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === PERMISSIONS_KEY)
        return [{ action: PermissionAction.READ, resource: PermissionResource.USER }];
      if (key === POLICY_KEY) return { name: 'self-only' };
      return undefined;
    });

    resolutionService.hasPermissions.mockResolvedValue(true);
    policyEvaluator.evaluate.mockResolvedValue(false); // policy fails

    const ctx = mockExecutionContext({ id: 'user-1' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
