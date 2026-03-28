import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { DeviceService } from './services/device.service';
import { DeviceEntity } from './entities/device.entity';
import { AdminAuditService } from '../admin-audit/admin-audit.service';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const mockAudit = () => ({ logAction: jest.fn() });

const mockManager = {
  findOne: jest.fn(),
  save: jest.fn(),
};

const mockDataSource = {
  transaction: jest.fn((cb: (em: EntityManager) => Promise<any>) =>
    cb(mockManager as unknown as EntityManager),
  ),
};

describe('DeviceService', () => {
  let service: DeviceService;
  let repo: ReturnType<typeof mockRepo>;
  let audit: ReturnType<typeof mockAudit>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: getRepositoryToken(DeviceEntity), useFactory: mockRepo },
        { provide: AdminAuditService, useFactory: mockAudit },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(DeviceService);
    repo = module.get(getRepositoryToken(DeviceEntity));
    audit = module.get(AdminAuditService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listUserDevices', () => {
    it('returns devices for the given userId', async () => {
      const devices = [{ id: 'dev-1', userId: 'user-1' }] as DeviceEntity[];
      repo.find.mockResolvedValue(devices);

      const result = await service.listUserDevices('user-1');

      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { lastLoginAt: 'DESC' },
      });
      expect(result).toBe(devices);
    });
  });

  describe('registerOrUpdateDevice', () => {
    const dto = {
      userId: 'user-1',
      deviceKey: 'fp-abc123',
      userAgent: 'Mozilla/5.0',
      lastIp: '1.2.3.4',
    };

    it('creates a new device when none exists', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = { ...dto, id: 'dev-new', trustLevel: 'neutral', trustScore: 50 };
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.registerOrUpdateDevice(dto);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ trustLevel: 'neutral', trustScore: 50 }),
      );
      expect(result).toEqual(created);
    });

    it('updates lastIp and lastLoginAt on existing device', async () => {
      const existing = {
        id: 'dev-1',
        userId: 'user-1',
        deviceKey: 'fp-abc123',
        trustLevel: 'neutral',
        lastIp: '0.0.0.0',
        lastLoginAt: new Date('2024-01-01'),
      } as DeviceEntity;
      repo.findOne.mockResolvedValue(existing);
      repo.save.mockResolvedValue({ ...existing, lastIp: '1.2.3.4' });

      await service.registerOrUpdateDevice(dto);

      expect(existing.lastIp).toBe('1.2.3.4');
      expect(repo.save).toHaveBeenCalledWith(existing);
    });

    it('throws ForbiddenException for banned device', async () => {
      repo.findOne.mockResolvedValue({ trustLevel: 'risky' } as DeviceEntity);

      await expect(service.registerOrUpdateDevice(dto)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('updateTrust', () => {
    it('updates trust level atomically and logs audit entry', async () => {
      const device = {
        id: 'dev-1',
        userId: 'user-1',
        trustLevel: 'neutral',
        trustScore: 50,
        manuallyTrusted: false,
        manuallyRisky: false,
      } as DeviceEntity;
      mockManager.findOne.mockResolvedValue(device);
      mockManager.save.mockResolvedValue({ ...device, trustLevel: 'trusted', trustScore: 90 });

      const result = await service.updateTrust('dev-1', 'user-1', 'trusted', '1.2.3.4');

      expect(mockManager.findOne).toHaveBeenCalledWith(
        DeviceEntity,
        expect.objectContaining({ where: { id: 'dev-1', userId: 'user-1' } }),
      );
      expect(mockManager.save).toHaveBeenCalled();
      expect(audit.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_DEVICE_TRUST',
          entityId: 'dev-1',
          beforeSnapshot: { trustLevel: 'neutral', trustScore: 50 },
        }),
      );
      expect(result.trustLevel).toBe('trusted');
    });

    it('throws NotFoundException when device does not belong to user', async () => {
      mockManager.findOne.mockResolvedValue(null);

      await expect(
        service.updateTrust('dev-x', 'user-1', 'trusted'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('isDeviceBanned', () => {
    it('returns true for risky device', async () => {
      repo.findOne.mockResolvedValue({ trustLevel: 'risky' } as DeviceEntity);
      expect(await service.isDeviceBanned('user-1', 'fp-abc')).toBe(true);
    });

    it('returns false for neutral device', async () => {
      repo.findOne.mockResolvedValue({ trustLevel: 'neutral' } as DeviceEntity);
      expect(await service.isDeviceBanned('user-1', 'fp-abc')).toBe(false);
    });

    it('returns false when device not found', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.isDeviceBanned('user-1', 'fp-abc')).toBe(false);
    });
  });
});
