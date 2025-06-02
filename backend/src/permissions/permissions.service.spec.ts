import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionsService } from './permissions.service';
import { Permission } from './permission.entity';
import { Role } from '../roles/role.entity';
import { NotFoundException, ConflictException } from '@nestjs/common';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let permissionsRepository: Repository<Permission>;
  let rolesRepository: Repository<Role>;

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

  const mockPermissionsRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
    query: jest.fn(),
  };

  const mockRolesRepository = {
    findByIds: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        {
          provide: getRepositoryToken(Permission),
          useValue: mockPermissionsRepository,
        },
        {
          provide: getRepositoryToken(Role),
          useValue: mockRolesRepository,
        },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
    permissionsRepository = module.get<Repository<Permission>>(getRepositoryToken(Permission));
    rolesRepository = module.get<Repository<Role>>(getRepositoryToken(Role));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a permission', async () => {
      mockPermissionsRepository.findOne.mockResolvedValue(mockPermission);

      const result = await service.findOne(mockPermission.id);
      expect(result).toBe(mockPermission);
    });

    it('should throw NotFoundException if permission not found', async () => {
      mockPermissionsRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a permission', async () => {
      const createDto = {
        name: 'users:create',
        description: 'Create new users',
        resource: 'users',
        action: 'create',
      };

      mockPermissionsRepository.findOne.mockResolvedValue(null); // No existing permission
      mockPermissionsRepository.create.mockReturnValue(mockPermission);
      mockPermissionsRepository.save.mockResolvedValue(mockPermission);

      const result = await service.create(createDto);
      expect(result).toBe(mockPermission);
    });

    it('should throw ConflictException if permission name exists', async () => {
      const createDto = {
        name: 'users:create',
        description: 'Create new users',
        resource: 'users',
        action: 'create',
      };

      mockPermissionsRepository.findOne.mockResolvedValue(mockPermission);

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('checkUserHasPermission', () => {
    it('should return true if user has permission', async () => {
      mockPermissionsRepository.query.mockResolvedValue([{ id: 'permission-id' }]);

      const result = await service.checkUserHasPermission('user-id', 'users:create');
      expect(result).toBe(true);
    });

    it('should return false if user does not have permission', async () => {
      mockPermissionsRepository.query.mockResolvedValue([]);

      const result = await service.checkUserHasPermission('user-id', 'users:create');
      expect(result).toBe(false);
    });
  });
});
