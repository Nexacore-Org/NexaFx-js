import { Test, TestingModule } from '@nestjs/testing';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto, UpdatePermissionDto } from './permissions.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';

describe('PermissionsController', () => {
  let controller: PermissionsController;
  let service: PermissionsService;

  const mockPermissionsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    linkRoles: jest.fn(),
    unlinkRole: jest.fn(),
  };

  const mockPermission = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'users:create',
    description: 'Create new users',
    resource: 'users',
    action: 'create',
    isActive: true,
    roles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PermissionsController],
      providers: [
        {
          provide: PermissionsService,
          useValue: mockPermissionsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .overrideGuard(PermissionsGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<PermissionsController>(PermissionsController);
    service = module.get<PermissionsService>(PermissionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return paginated permissions', async () => {
      const result = {
        data: [mockPermission],
        meta: { total: 1, page: 1, limit: 10, totalPages: 1 },
      };
      mockPermissionsService.findAll.mockResolvedValue(result);

      expect(await controller.findAll(1, 10)).toBe(result);
    });
  });

  describe('findOne', () => {
    it('should return a permission', async () => {
      mockPermissionsService.findOne.mockResolvedValue(mockPermission);

      expect(await controller.findOne(mockPermission.id)).toBe(mockPermission);
    });
  });

  describe('create', () => {
    it('should create a permission', async () => {
      const createDto: CreatePermissionDto = {
        name: 'users:create',
        description: 'Create new users',
        resource: 'users',
        action: 'create',
      };
      mockPermissionsService.create.mockResolvedValue(mockPermission);

      expect(await controller.create(createDto)).toBe(mockPermission);
    });
  });

  describe('update', () => {
    it('should update a permission', async () => {
      const updateDto: UpdatePermissionDto = {
        description: 'Updated description',
      };
      const updatedPermission = { ...mockPermission, ...updateDto };
      mockPermissionsService.update.mockResolvedValue(updatedPermission);

      expect(await controller.update(mockPermission.id, updateDto)).toBe(updatedPermission);
    });
  });

  describe('remove', () => {
    it('should delete a permission', async () => {
      mockPermissionsService.remove.mockResolvedValue(undefined);

      await expect(controller.remove(mockPermission.id)).resolves.toBeUndefined();
    });
  });

  describe('linkRoles', () => {
    it('should link roles to permission', async () => {
      const roleIds = ['role1', 'role2'];
      const linkedPermission = { ...mockPermission, roles: [{ id: 'role1' }, { id: 'role2' }] };
      mockPermissionsService.linkRoles.mockResolvedValue(linkedPermission);

      expect(await controller.linkRoles(mockPermission.id, { roleIds })).toBe(linkedPermission);
    });
  });
});
