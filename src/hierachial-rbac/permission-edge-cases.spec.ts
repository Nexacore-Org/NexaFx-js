import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionResolutionService } from '../policies/permission-resolution.service';
import { PolicyEvaluatorService } from '../policies/policy-evaluator.service';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RbacAuditService } from '../services/rbac-audit.service';
import { Reflector } from '@nestjs/core';
import { Role } from '../entities/role.entity';
import { Permission, PermissionAction, PermissionResource } from '../entities/permission.entity';
import { User } from '../entities/user.entity';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

/**
 * Edge case integration tests for permission evaluation logic.
 * Tests complex scenarios involving role hierarchy, scoped permissions,
 * wildcard matching, and policy combinations.
 */
describe('Permission edge cases', () => {
  let resolutionService: PermissionResolutionService;
  let guard: PermissionsGuard;
  let policyEvaluator: PolicyEvaluatorService;
  let reflector: Reflector;

  const makeP = (action: PermissionAction, resource: PermissionResource, scope?: string): Permission => {
    const p = new Permission();
    p.id = `${action}-${resource}-${scope ?? 'g'}`;
    p.action = action;
    p.resource = resource;
    p.scope = scope ?? null;
    p.isActive = true;
    Object.defineProperty(p, 'key', {
      get: () => scope ? `${action}:${resource}:${scope}` : `${action}:${resource}`,
    });
    return p;
  };

  const makeR = (name: string, perms: Permission[] = [], parent?: Role): Role => {
    const r = new Role();
    r.id = `r-${name}`;
    r.name = name;
    r.isActive = true;
    r.permissions = perms;
    r.parent = parent ?? null;
    r.parentId = parent?.id ?? null;
    return r;
  };

  const makeUser = (roles: Role[]): User => {
    const u = new User();
    u.id = 'test-user';
    u.roles = roles;
    return u;
  };

  const setupResolution = (user: User, allRoles: Role[]) => {
    const rolesMap = new Map(allRoles.map((r) => [r.id, r]));
    (resolutionService as any).roleRepository = {
      findOne: jest.fn(({ where }) => Promise.resolve(rolesMap.get(where.id) ?? null)),
    };
    (resolutionService as any).userRepository = {
      findOne: jest.fn(() => Promise.resolve(user)),
    };
    (resolutionService as any).permissionRepository = { find: jest.fn(() => []) };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionResolutionService,
        PolicyEvaluatorService,
        PermissionsGuard,
        Reflector,
        { provide: getRepositoryToken(Role), useValue: {} },
        { provide: getRepositoryToken(Permission), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: RbacAuditService, useValue: { log: jest.fn().mockResolvedValue(null) } },
      ],
    }).compile();

    resolutionService = module.get(PermissionResolutionService);
    policyEvaluator = module.get(PolicyEvaluatorService);
    guard = module.get(PermissionsGuard);
    reflector = module.get(Reflector);
  });

  describe('Deep hierarchy (3+ levels)', () => {
    it('inherits permissions across 3 levels', async () => {
      const grandparentPerm = makeP(PermissionAction.APPROVE, PermissionResource.TRANSACTION);
      const grandparent = makeR('GRANDPARENT', [grandparentPerm]);

      const parentPerm = makeP(PermissionAction.READ, PermissionResource.REPORT);
      const parent = makeR('PARENT', [parentPerm], grandparent);
      parent.parentId = grandparent.id;

      const childPerm = makeP(PermissionAction.READ, PermissionResource.USER);
      const child = makeR('CHILD', [childPerm], parent);
      child.parentId = parent.id;

      const user = makeUser([child]);
      setupResolution(user, [grandparent, parent, child]);

      const result = await resolutionService.resolveUserPermissions('test-user');

      expect(result.permissions.has('read:user')).toBe(true);
      expect(result.permissions.has('read:report')).toBe(true);
      expect(result.permissions.has('approve:transaction')).toBe(true);
    });
  });

  describe('Multiple role assignment', () => {
    it('merges permissions from multiple roles', async () => {
      const roleA = makeR('ROLE_A', [makeP(PermissionAction.READ, PermissionResource.USER)]);
      const roleB = makeR('ROLE_B', [makeP(PermissionAction.EXPORT, PermissionResource.REPORT)]);

      const user = makeUser([roleA, roleB]);
      setupResolution(user, [roleA, roleB]);

      const result = await resolutionService.resolveUserPermissions('test-user');
      expect(result.permissions.has('read:user')).toBe(true);
      expect(result.permissions.has('export:report')).toBe(true);
    });
  });

  describe('Scoped permission edge cases', () => {
    it('MANAGE on scoped resource implies all actions on that scope', async () => {
      const role = makeR('SCOPED', [makeP(PermissionAction.MANAGE, PermissionResource.TOKEN, 'currency:BTC')]);
      const user = makeUser([role]);
      setupResolution(user, [role]);

      const result = await resolutionService.resolveUserPermissions('test-user');
      expect(result.permissions.has('create:token:currency:BTC')).toBe(true);
      expect(result.permissions.has('delete:token:currency:BTC')).toBe(true);
      // Should NOT imply global token perms
      expect(result.permissions.has('delete:token')).toBe(false);
    });

    it('does not allow access to different scope', async () => {
      const role = makeR('USD_ONLY', [makeP(PermissionAction.READ, PermissionResource.TOKEN, 'currency:USD')]);
      const user = makeUser([role]);
      setupResolution(user, [role]);

      const hasUSD = await resolutionService.hasPermissions('test-user', [
        { action: PermissionAction.READ, resource: PermissionResource.TOKEN, scope: 'currency:USD' },
      ]);
      const hasBTC = await resolutionService.hasPermissions('test-user', [
        { action: PermissionAction.READ, resource: PermissionResource.TOKEN, scope: 'currency:BTC' },
      ]);

      expect(hasUSD).toBe(true);
      expect(hasBTC).toBe(false);
    });
  });

  describe('Inactive permissions/roles', () => {
    it('does not grant permissions from inactive permission', async () => {
      const inactivePerm = makeP(PermissionAction.DELETE, PermissionResource.USER);
      inactivePerm.isActive = false;
      // Override key getter for inactive
      const role = makeR('ROLE', [inactivePerm]);
      // Since collectPermissionsFromRole filters isActive, it won't add the key
      const user = makeUser([role]);
      setupResolution(user, [role]);

      const result = await resolutionService.resolveUserPermissions('test-user');
      expect(result.permissions.has('delete:user')).toBe(false);
    });

    it('skips inactive roles entirely', async () => {
      const role = makeR('INACTIVE');
      role.isActive = false;
      role.permissions = [makeP(PermissionAction.MANAGE, PermissionResource.ALL)];
      const user = makeUser([role]);

      // The role repository returns null for inactive roles
      (resolutionService as any).roleRepository = {
        findOne: jest.fn(() => Promise.resolve(null)),
      };
      (resolutionService as any).userRepository = {
        findOne: jest.fn(() => Promise.resolve(user)),
      };

      const result = await resolutionService.resolveUserPermissions('test-user');
      expect(result.permissions.size).toBe(0);
    });
  });

  describe('PermissionsGuard + PolicyEvaluator combination', () => {
    const makeCtx = (userId: string, url = '/test') => ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: userId },
          url,
          method: 'GET',
          ip: '127.0.0.1',
          headers: { 'user-agent': 'jest' },
          params: { userId },
        }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    });

    beforeEach(() => {
      // Setup user with READ:USER permission
      const role = makeR('BASE', [makeP(PermissionAction.READ, PermissionResource.USER)]);
      const user = makeUser([role]);
      setupResolution(user, [role]);
    });

    it('grants when both permission check and policy pass', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
        if (key === PERMISSIONS_KEY)
          return [{ action: PermissionAction.READ, resource: PermissionResource.USER }];
        return { name: 'self-only' };
      });

      policyEvaluator.register('self-only', (ctx: any) => ctx.user.id === ctx.resource?.userId);
      const ctx = makeCtx('test-user');
      await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    });

    it('denies when permission passes but policy fails', async () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockImplementation((key: string) => {
        if (key === PERMISSIONS_KEY)
          return [{ action: PermissionAction.READ, resource: PermissionResource.USER }];
        return { name: 'self-only' };
      });

      policyEvaluator.register('self-only', (ctx: any) => ctx.user.id === ctx.resource?.userId);
      const ctx = makeCtx('different-user'); // different user from params.userId
      await expect(guard.canActivate(ctx as any)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Permission key format', () => {
    it('generates correct key without scope', () => {
      const p = makeP(PermissionAction.CREATE, PermissionResource.WALLET);
      expect(p.key).toBe('create:wallet');
    });

    it('generates correct key with scope', () => {
      const p = makeP(PermissionAction.READ, PermissionResource.TOKEN, 'currency:USD');
      expect(p.key).toBe('read:token:currency:USD');
    });
  });
});
