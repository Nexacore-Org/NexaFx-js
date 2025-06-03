import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DeviceService } from './device.service';
import { Device } from './device.entity';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('DeviceService', () => {
  let service: DeviceService;
  let repository: Repository<Device>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        {
          provide: getRepositoryToken(Device),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
    repository = module.get<Repository<Device>>(getRepositoryToken(Device));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createDevice', () => {
    it('should create a new device when it does not exist', async () => {
      const createDeviceDto = {
        userId: 'user-1',
        userAgent: 'Mozilla/5.0 Chrome/91.0',
        ipAddress: '192.168.1.1',
      };

      const mockDevice = {
        id: 'device-1',
        ...createDeviceDto,
        deviceType: 'desktop',
        isActive: true,
        lastUsedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockDevice);
      mockRepository.save.mockResolvedValue(mockDevice);

      const result = await service.createDevice(createDeviceDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: {
          userId: createDeviceDto.userId,
          userAgent: createDeviceDto.userAgent,
          ipAddress: createDeviceDto.ipAddress,
        },
      });
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(mockDevice);
      expect(result.id).toBe('device-1');
    });

    it('should update existing device when it already exists', async () => {
      const createDeviceDto = {
        userId: 'user-1',
        userAgent: 'Mozilla/5.0 Chrome/91.0',
        ipAddress: '192.168.1.1',
      };

      const existingDevice = {
        id: 'device-1',
        ...createDeviceDto,
        isActive: false,
        lastUsedAt: new Date('2023-01-01'),
      };

      mockRepository.findOne.mockResolvedValue(existingDevice);
      mockRepository.save.mockResolvedValue({
        ...existingDevice,
        isActive: true,
        lastUsedAt: expect.any(Date),
      });

      const result = await service.createDevice(createDeviceDto);

      expect(mockRepository.save).toHaveBeenCalledWith({
        ...existingDevice,
        isActive: true,
        lastUsedAt: expect.any(Date),
      });
      expect(result.isActive).toBe(true);
    });
  });

  describe('revokeDevice', () => {
    it('should revoke device successfully', async () => {
      const deviceId = 'device-1';
      const userId = 'user-1';
      const mockDevice = {
        id: deviceId,
        userId,
        isActive: true,
      };

      mockRepository.findOne.mockResolvedValue(mockDevice);
      mockRepository.save.mockResolvedValue({ ...mockDevice, isActive: false });

      await service.revokeDevice(deviceId, userId);

      expect(mockRepository.save).toHaveBeenCalledWith({
        ...mockDevice,
        isActive: false,
      });
    });

    it('should throw NotFoundException when device not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.revokeDevice('device-1', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user tries to revoke another user\'s device', async () => {
      const mockDevice = {
        id: 'device-1',
        userId: 'user-2', // Different user
        isActive: true,
      };

      mockRepository.findOne.mockResolvedValue(mockDevice);

      await expect(service.revokeDevice('device-1', 'user-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });

  describe('getUserDevices', () => {
    it('should return user devices', async () => {
      const userId = 'user-1';
      const mockDevices = [
        {
          id: 'device-1',
          userId,
          userAgent: 'Chrome',
          ipAddress: '192.168.1.1',
          isActive: true,
          lastUsedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.find.mockResolvedValue(mockDevices);

      const result = await service.getUserDevices(userId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { userId, isActive: true },
        order: { lastUsedAt: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('device-1');
    });
  });
});