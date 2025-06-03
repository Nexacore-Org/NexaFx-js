import { Test, TestingModule } from '@nestjs/testing';
import { DeviceController } from './device.controller';
import { DeviceService } from './device.service';

describe('DeviceController', () => {
  let controller: DeviceController;
  let service: DeviceService;

  const mockDeviceService = {
    createDevice: jest.fn(),
    getUserDevices: jest.fn(),
    revokeDevice: jest.fn(),
    revokeAllDevices: jest.fn(),
    updateDeviceUsage: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeviceController],
      providers: [
        {
          provide: DeviceService,
          useValue: mockDeviceService,
        },
      ],
    }).compile();

    controller = module.get<DeviceController>(DeviceController);
    service = module.get<DeviceService>(DeviceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('loginDevice', () => {
    it('should register device on login', async () => {
      const mockRequest = {
        user: { id: 'user-1' },
        get: jest.fn().mockReturnValue('Mozilla/5.0 Chrome/91.0'),
        ip: '192.168.1.1',
      } as any;

      const expectedDevice = {
        id: 'device-1',
        userId: 'user-1',
        userAgent: 'Mozilla/5.0 Chrome/91.0',
        ipAddress: '192.168.1.1',
      };

      mockDeviceService.createDevice.mockResolvedValue(expectedDevice);

      const result = await controller.loginDevice(mockRequest);

      expect(mockDeviceService.createDevice).toHaveBeenCalledWith({
        userId: 'user-1',
        userAgent: 'Mozilla/5.0 Chrome/91.0',
        ipAddress: '192.168.1.1',
      });
      expect(result).toEqual(expectedDevice);
    });
  });

  describe('revokeDevice', () => {
    it('should revoke device', async () => {
      const mockRequest = {
        user: { id: 'user-1' },
      } as any;

      mockDeviceService.revokeDevice.mockResolvedValue(undefined);

      await controller.revokeDevice('device-1', mockRequest);

      expect(mockDeviceService.revokeDevice).toHaveBeenCalledWith('device-1', 'user-1');
    });
  });

  describe('getUserDevices', () => {
    it('should return user devices', async () => {
      const mockRequest = {
        user: { id: 'user-1' },
      } as any;

      const expectedDevices = [
        {
          id: 'device-1',
          userId: 'user-1',
          userAgent: 'Chrome',
          ipAddress: '192.168.1.1',
        },
      ];

      mockDeviceService.getUserDevices.mockResolvedValue(expectedDevices);

      const result = await controller.getUserDevices(mockRequest);

      expect(mockDeviceService.getUserDevices).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(expectedDevices);
    });
  });
});