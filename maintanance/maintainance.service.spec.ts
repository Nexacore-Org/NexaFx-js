import { Test, TestingModule } from '@nestjs/testing';
import { MaintenanceService } from './maintenance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MaintenanceConfig } from './entities/maintenance-config.entity';
import { Repository } from 'typeorm';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let repository: Repository<MaintenanceConfig>;

  const mockConfig: MaintenanceConfig = {
    id: '1',
    isMaintenanceMode: false,
    message: 'System is under maintenance',
    estimatedEndTime: null,
    disabledEndpoints: [],
    bypassRoles: ['admin'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceService,
        {
          provide: getRepositoryToken(MaintenanceConfig),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<MaintenanceService>(MaintenanceService);
    repository = module.get<Repository<MaintenanceConfig>>(
      getRepositoryToken(MaintenanceConfig),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should create default config if none exists', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockResolvedValue(mockConfig);

      await service.onModuleInit();

      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should load existing config', async () => {
      mockRepository.findOne.mockResolvedValue(mockConfig);

      await service.onModuleInit();

      expect(mockRepository.findOne).toHaveBeenCalled();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('enableMaintenance', () => {
    it('should enable maintenance mode', async () => {
      const enabledConfig = { ...mockConfig, isMaintenanceMode: true };
      mockRepository.save.mockResolvedValue(enabledConfig);
      service['cachedConfig'] = mockConfig;

      const result = await service.enableMaintenance({
        message: 'Maintenance in progress',
      });

      expect(result.isMaintenanceMode).toBe(true);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should set custom message and ETA', async () => {
      const eta = new Date('2024-12-31');
      const enabledConfig = {
        ...mockConfig,
        isMaintenanceMode: true,
        message: 'Custom message',
        estimatedEndTime: eta,
      };
      mockRepository.save.mockResolvedValue(enabledConfig);
      service['cachedConfig'] = mockConfig;

      const result = await service.enableMaintenance({
        message: 'Custom message',
        estimatedEndTime: eta,
      });

      expect(result.message).toBe('Custom message');
      expect(result.estimatedEndTime).toBe(eta);
    });
  });

  describe('disableMaintenance', () => {
    it('should disable maintenance mode', async () => {
      const disabledConfig = { ...mockConfig, isMaintenanceMode: false };
      mockRepository.save.mockResolvedValue(disabledConfig);
      service['cachedConfig'] = { ...mockConfig, isMaintenanceMode: true };

      const result = await service.disableMaintenance();

      expect(result.isMaintenanceMode).toBe(false);
      expect(result.estimatedEndTime).toBeNull();
    });
  });

  describe('isEndpointDisabled', () => {
    it('should match exact endpoint', () => {
      service['cachedConfig'] = {
        ...mockConfig,
        disabledEndpoints: ['/api/v1/users'],
      };

      expect(service.isEndpointDisabled('/api/v1/users')).toBe(true);
      expect(service.isEndpointDisabled('/api/v1/posts')).toBe(false);
    });

    it('should match wildcard patterns', () => {
      service['cachedConfig'] = {
        ...mockConfig,
        disabledEndpoints: ['/api/v1/users/*'],
      };

      expect(service.isEndpointDisabled('/api/v1/users/123')).toBe(true);
      expect(service.isEndpointDisabled('/api/v1/users/123/posts')).toBe(true);
      expect(service.isEndpointDisabled('/api/v1/posts')).toBe(false);
    });

    it('should handle multiple patterns', () => {
      service['cachedConfig'] = {
        ...mockConfig,
        disabledEndpoints: ['/api/v1/users/*', '/api/v1/orders'],
      };

      expect(service.isEndpointDisabled('/api/v1/users/123')).toBe(true);
      expect(service.isEndpointDisabled('/api/v1/orders')).toBe(true);
      expect(service.isEndpointDisabled('/api/v1/posts')).toBe(false);
    });
  });

  describe('canBypass', () => {
    it('should allow bypass for configured roles', () => {
      service['cachedConfig'] = {
        ...mockConfig,
        bypassRoles: ['admin', 'superadmin'],
      };

      expect(service.canBypass('admin')).toBe(true);
      expect(service.canBypass('superadmin')).toBe(true);
      expect(service.canBypass('user')).toBe(false);
    });
  });

  describe('getMaintenanceResponse', () => {
    it('should return proper response format', () => {
      const eta = new Date('2024-12-31');
      service['cachedConfig'] = {
        ...mockConfig,
        message: 'Custom maintenance message',
        estimatedEndTime: eta,
      };

      const response = service.getMaintenanceResponse();

      expect(response).toEqual({
        statusCode: 503,
        message: 'Custom maintenance message',
        maintenanceMode: true,
        estimatedEndTime: eta,
      });
    });
  });
});