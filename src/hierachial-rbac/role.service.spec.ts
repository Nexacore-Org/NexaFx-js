import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoleService } from '../services/role.service';
import { Role } from '../entities/role.entity';
import { Permission, PermissionAction, PermissionResource } from '../entities/permission.entity';
import { User } from '../entities/user.entity';
import { RbacAuditService } from '../services/rbac-audit.service';

const mockRole = (overrides: Partial<Role> = {}): Role =>
  Object.assign(new Role(), {
    id: 'role-1',
    name: 'TEST_ROLE',
    isSystem: false,
    isActive: true,
    permissions: [],
    ...overrides,
  });

const mockPermission = (id = 'perm-1'): Permission =>
  Object.assign(new Permission(), {
    id,
    action: PermissionAction.READ,
    resource: PermissionResource.USER,
    isActive: true,
  });

const mockUser = (id = 'user-1'): User =>
  Object.assign(new User(), { id, email: 'test@test.com', roles: [] });

describe('RoleService', () => {
  let service: RoleService;
  let roleRepo: any;
  let permRepo: any;
  let userRepo: any;
  let auditService: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleService,
        {
          provide: getRepositoryToken(Role),
          useValue: {
            findOne: jest.fn(),
            findByIds: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Permission),
          useValue: { findByIds: jest.fn() },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: RbacAuditService,
          useValue: { log: jest.fn().mockResolvedValue(null) },
        },
      ],
    }).compile();

    service = module.get(RoleService);
    roleRepo = module.get(getRepositoryToken(Role));
    permRepo = module.get(getRepositoryToken(Permission));
    userRepo = module.get(getRepositoryToken(User));
    auditService = module.get(RbacAuditService);
  });

  describe('create', () => {
    it('creates a new role successfully', async () => {
      const dto = { name: 'NEW_ROLE', priority: 10 };
      const created = mockRole({ name: 'NEW_ROLE' });

      roleRepo.findOne.mockResolvedValue(null);
      roleRepo.create.mockReturnValue(created);
      roleRepo.save.mockResolvedValue(created);

      const result = await service.create(dto, 'actor-1');
      expect(result.name).toBe('NEW_ROLE');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_CREATED' }),
      );
    });

    it('throws ConflictException if name already exists', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole());
      await expect(service.create({ name: 'TEST_ROLE' }, 'actor')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException if parentId is invalid', async () => {
      roleRepo.findOne
        .mockResolvedValueOnce(null) // name check passes
        .mockResolvedValueOnce(null); // parent not found

      await expect(
        service.create({ name: 'CHILD', parentId: 'bad-id' }, 'actor'),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets parent role correctly', async () => {
      const parent = mockRole({ id: 'parent-1', name: 'PARENT' });
      const child = mockRole({ id: 'child-1', name: 'CHILD', parent });

      roleRepo.findOne
        .mockResolvedValueOnce(null) // name check
        .mockResolvedValueOnce(parent); // parent lookup
      roleRepo.create.mockReturnValue(child);
      roleRepo.save.mockResolvedValue(child);

      const result = await service.create({ name: 'CHILD', parentId: 'parent-1' }, 'actor');
      expect(roleRepo.create).toHaveBeenCalledWith(expect.objectContaining({ parent }));
    });
  });

  describe('update', () => {
    it('updates a role successfully', async () => {
      const role = mockRole();
      roleRepo.findOne.mockResolvedValue(role);
      roleRepo.save.mockResolvedValue({ ...role, priority: 50 });

      const result = await service.update('role-1', { priority: 50 }, 'actor');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_UPDATED' }),
      );
    });

    it('throws ForbiddenException when modifying system role name', async () => {
      const role = mockRole({ isSystem: true });
      roleRepo.findOne.mockResolvedValue(role);

      await expect(service.update('role-1', { name: 'HACKED' }, 'actor')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws BadRequestException if parentId === id', async () => {
      const role = mockRole();
      roleRepo.findOne.mockResolvedValue(role);

      await expect(service.update('role-1', { parentId: 'role-1' }, 'actor')).rejects.toThrow();
    });
  });

  describe('remove', () => {
    it('removes a non-system role', async () => {
      const role = mockRole();
      roleRepo.findOne.mockResolvedValue(role);
      roleRepo.remove.mockResolvedValue(undefined);

      await service.remove('role-1', 'actor');
      expect(roleRepo.remove).toHaveBeenCalledWith(role);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'ROLE_DELETED' }),
      );
    });

    it('throws ForbiddenException for system role', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole({ isSystem: true }));
      await expect(service.remove('role-1', 'actor')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('assignPermissions', () => {
    it('appends permissions (non-replace)', async () => {
      const existing = mockPermission('perm-existing');
      const role = mockRole({ permissions: [existing] });
      const newPerm = mockPermission('perm-new');

      roleRepo.findOne.mockResolvedValue(role);
      permRepo.findByIds.mockResolvedValue([newPerm]);
      roleRepo.save.mockImplementation((r: Role) => Promise.resolve(r));

      const result = await service.assignPermissions(
        'role-1',
        { permissionIds: ['perm-new'], replace: false },
        'actor',
      );

      expect(result.permissions).toHaveLength(2);
    });

    it('replaces permissions when replace=true', async () => {
      const existing = mockPermission('perm-existing');
      const role = mockRole({ permissions: [existing] });
      const newPerm = mockPermission('perm-new');

      roleRepo.findOne.mockResolvedValue(role);
      permRepo.findByIds.mockResolvedValue([newPerm]);
      roleRepo.save.mockImplementation((r: Role) => Promise.resolve(r));

      const result = await service.assignPermissions(
        'role-1',
        { permissionIds: ['perm-new'], replace: true },
        'actor',
      );

      expect(result.permissions).toHaveLength(1);
      expect(result.permissions[0].id).toBe('perm-new');
    });

    it('throws NotFoundException if a permission id is invalid', async () => {
      roleRepo.findOne.mockResolvedValue(mockRole());
      permRepo.findByIds.mockResolvedValue([]); // none found

      await expect(
        service.assignPermissions('role-1', { permissionIds: ['bad-id'] }, 'actor'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('assignRolesToUser', () => {
    it('assigns roles to user successfully', async () => {
      const user = mockUser();
      const role = mockRole();

      userRepo.findOne.mockResolvedValue(user);
      roleRepo.findByIds.mockResolvedValue([role]);
      userRepo.save.mockImplementation((u: User) => Promise.resolve(u));

      const result = await service.assignRolesToUser(
        { userId: 'user-1', roleIds: ['role-1'] },
        'actor',
      );

      expect(result.roles).toContain(role);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ROLE_ASSIGNED' }),
      );
    });

    it('throws NotFoundException for unknown user', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(
        service.assignRolesToUser({ userId: 'ghost', roleIds: ['role-1'] }, 'actor'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
