import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PermissionResolutionService } from '../policies/permission-resolution.service';
import { Role } from '../entities/role.entity';
import { Permission, PermissionAction, PermissionResource } from '../entities/permission.entity';
import { User } from '../entities/user.entity';

const makePermission = (
  action: PermissionAction,
  resource: PermissionResource,
  scope?: string,
): Permission => {
  const p = new Permission();
  p.id = `${action}-${resource}-${scope ?? 'global'}`;
  p.action = action;
  p.resource = resource;
  p.scope = scope ?? null;
  p.isActive = true;
  Object.defineProperty(p, 'key', {
    get() {
      return scope ? `${action}:${resource}:${scope}` : `${action}:${resource}`;
    },
  });
  return p;
};

const makeRole = (name: string, permissions: Permission[] = [], parent?: Role): Role => {
  const r = new Role();
  r.id = `role-${name}`;
  r.name = name;
  r.isActive = true;
  r.permissions = permissions;
  r.parent = parent ?? null;
  r.parentId = parent?.id ?? null;
  return r;
};

describe('PermissionResolutionService', () => {
  let service: PermissionResolutionService;
  let roleRepo: any;
  let userRepo: any;

  const buildRepos = (rolesMap: Map<string, Role>, user: User) => ({
    role: {
      findOne: jest.fn(({ where }) => Promise.resolve(rolesMap.get(where.id) ?? null)),
    },
    permission: { find: jest.fn(() => Promise.resolve([])) },
    user: {
      findOne: jest.fn(() => Promise.resolve(user)),
    },
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionResolutionService,
        { provide: getRepositoryToken(Role), useValue: {} },
        { provide: getRepositoryToken(Permission), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
      ],
    }).compile();

    service = module.get(PermissionResolutionService);
  });

  const inject = (repos: { role: any; permission: any; user: any }) => {
    (service as any).roleRepository = repos.role;
    (service as any).permissionRepository = repos.permission;
    (service as any).userRepository = repos.user;
  };

  describe('resolveUserPermissions', () => {
    it('returns empty set for user with no roles', async () => {
      const user = new User();
      user.id = 'u1';
      user.roles = [];
      inject(buildRepos(new Map(), user));

      const result = await service.resolveUserPermissions('u1');
      expect(result.permissions.size).toBe(0);
      expect(result.roles).toHaveLength(0);
    });

    it('returns empty set for missing user', async () => {
      (service as any).userRepository = { findOne: jest.fn(() => null) };
      const result = await service.resolveUserPermissions('ghost');
      expect(result.permissions.size).toBe(0);
    });

    it('collects direct role permissions', async () => {
      const perm = makePermission(PermissionAction.READ, PermissionResource.USER);
      const role = makeRole('USER', [perm]);
      const user = new User();
      user.id = 'u1';
      user.roles = [role];

      const rolesMap = new Map([[role.id, role]]);
      inject(buildRepos(rolesMap, user));

      const result = await service.resolveUserPermissions('u1');
      expect(result.permissions.has('read:user')).toBe(true);
      expect(result.roles).toContain('USER');
    });

    it('inherits permissions from parent role', async () => {
      const parentPerm = makePermission(PermissionAction.MANAGE, PermissionResource.REPORT);
      const parent = makeRole('ADMIN', [parentPerm]);

      const childPerm = makePermission(PermissionAction.READ, PermissionResource.USER);
      const child = makeRole('MODERATOR', [childPerm], parent);
      parent.id = 'role-ADMIN';
      child.parentId = parent.id;

      const user = new User();
      user.id = 'u1';
      user.roles = [child];

      const rolesMap = new Map([
        [child.id, child],
        [parent.id, parent],
      ]);
      inject(buildRepos(rolesMap, user));

      const result = await service.resolveUserPermissions('u1');
      expect(result.permissions.has('read:user')).toBe(true);
      expect(result.permissions.has('manage:report')).toBe(true);
    });

    it('does not cycle on circular parent references', async () => {
      const roleA = makeRole('A');
      const roleB = makeRole('B');
      roleA.parent = roleB;
      roleA.parentId = roleB.id;
      roleB.parent = roleA;
      roleB.parentId = roleA.id;

      const user = new User();
      user.id = 'u1';
      user.roles = [roleA];

      const rolesMap = new Map([
        [roleA.id, roleA],
        [roleB.id, roleB],
      ]);
      inject(buildRepos(rolesMap, user));

      // Should resolve without infinite loop
      const result = await service.resolveUserPermissions('u1');
      expect(result).toBeDefined();
    });

    it('expands MANAGE into all sub-actions', async () => {
      const managePerm = makePermission(PermissionAction.MANAGE, PermissionResource.WALLET);
      const role = makeRole('FINANCE', [managePerm]);
      const user = new User();
      user.id = 'u1';
      user.roles = [role];

      const rolesMap = new Map([[role.id, role]]);
      inject(buildRepos(rolesMap, user));

      const result = await service.resolveUserPermissions('u1');
      expect(result.permissions.has('create:wallet')).toBe(true);
      expect(result.permissions.has('read:wallet')).toBe(true);
      expect(result.permissions.has('update:wallet')).toBe(true);
      expect(result.permissions.has('delete:wallet')).toBe(true);
    });

    it('expands manage:* to all resources', async () => {
      const superPerm = makePermission(PermissionAction.MANAGE, PermissionResource.ALL);
      const role = makeRole('SUPER_ADMIN', [superPerm]);
      const user = new User();
      user.id = 'u1';
      user.roles = [role];

      const rolesMap = new Map([[role.id, role]]);
      inject(buildRepos(rolesMap, user));

      const result = await service.resolveUserPermissions('u1');
      expect(result.permissions.has('read:user')).toBe(true);
      expect(result.permissions.has('delete:role')).toBe(true);
      expect(result.permissions.has('create:transaction')).toBe(true);
    });
  });

  describe('hasPermissions', () => {
    const setupUser = (permissions: Permission[], rolesMap?: Map<string, Role>) => {
      const role = makeRole('TEST', permissions);
      const user = new User();
      user.id = 'u1';
      user.roles = [role];
      const map = rolesMap ?? new Map([[role.id, role]]);
      inject(buildRepos(map, user));
    };

    it('returns true when user has exact permission', async () => {
      setupUser([makePermission(PermissionAction.READ, PermissionResource.USER)]);
      const result = await service.hasPermissions('u1', [
        { action: PermissionAction.READ, resource: PermissionResource.USER },
      ]);
      expect(result).toBe(true);
    });

    it('returns false when user lacks permission', async () => {
      setupUser([makePermission(PermissionAction.READ, PermissionResource.USER)]);
      const result = await service.hasPermissions('u1', [
        { action: PermissionAction.DELETE, resource: PermissionResource.USER },
      ]);
      expect(result).toBe(false);
    });

    it('returns true when user has MANAGE on the resource (implied)', async () => {
      setupUser([makePermission(PermissionAction.MANAGE, PermissionResource.USER)]);
      const result = await service.hasPermissions('u1', [
        { action: PermissionAction.DELETE, resource: PermissionResource.USER },
      ]);
      expect(result).toBe(true);
    });

    it('handles scoped permission exact match', async () => {
      setupUser([makePermission(PermissionAction.READ, PermissionResource.TOKEN, 'currency:USD')]);
      const result = await service.hasPermissions('u1', [
        { action: PermissionAction.READ, resource: PermissionResource.TOKEN, scope: 'currency:USD' },
      ]);
      expect(result).toBe(true);
    });

    it('does not grant scoped permission when only global exists', async () => {
      setupUser([makePermission(PermissionAction.READ, PermissionResource.TOKEN)]);
      const result = await service.hasPermissions('u1', [
        { action: PermissionAction.READ, resource: PermissionResource.TOKEN, scope: 'currency:USD' },
      ]);
      // Global read:token does NOT automatically satisfy scoped read:token:currency:USD
      // (this is intentional — scope must be explicitly handled by MANAGE)
      expect(result).toBe(false);
    });

    it('uses ANY operator correctly', async () => {
      setupUser([makePermission(PermissionAction.READ, PermissionResource.USER)]);
      const result = await service.hasPermissions(
        'u1',
        [
          { action: PermissionAction.READ, resource: PermissionResource.USER },
          { action: PermissionAction.DELETE, resource: PermissionResource.ADMIN },
        ],
        'ANY',
      );
      expect(result).toBe(true);
    });

    it('uses ALL operator correctly', async () => {
      setupUser([makePermission(PermissionAction.READ, PermissionResource.USER)]);
      const result = await service.hasPermissions(
        'u1',
        [
          { action: PermissionAction.READ, resource: PermissionResource.USER },
          { action: PermissionAction.DELETE, resource: PermissionResource.ADMIN },
        ],
        'ALL',
      );
      expect(result).toBe(false);
    });

    it('matches manage:* global wildcard for any action/resource', async () => {
      setupUser([makePermission(PermissionAction.MANAGE, PermissionResource.ALL)]);
      const result = await service.hasPermissions('u1', [
        { action: PermissionAction.APPROVE, resource: PermissionResource.TRANSACTION },
      ]);
      expect(result).toBe(true);
    });
  });
});
