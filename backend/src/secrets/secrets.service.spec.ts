import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SecretsService } from './secrets.service';
import { Secret } from './entities/secret.entity';
import { NotificationService } from '../notifications/notification.service';
import { SecretType } from './dto/secrets.dto';

describe('SecretsService', () => {
  let service: SecretsService;
  let repository: Repository<Secret>;
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;
  let notificationService: NotificationService;

  const mockSecret = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'test-api-key',
    value: 'encrypted-value',
    type: SecretType.API_KEY,
    description: 'Test API key',
    isActive: true,
    expiresAt: null,
    lastRotatedAt: new Date(),
    rotationCount: 0,
    affectedServices: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[mockSecret], 1]),
    })),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('test-encryption-key'),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  const mockNotificationService = {
    notifyServiceOfSecretRotation: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecretsService,
        {
          provide: getRepositoryToken(Secret),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<SecretsService>(SecretsService);
    repository = module.get<Repository<Secret>>(getRepositoryToken(Secret));
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
    notificationService = module.get<NotificationService>(NotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated secrets', async () => {
      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result).toEqual({
        data: expect.any(Array),
        meta: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
        },
      });
      expect(mockRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should apply search filter when provided', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockSecret], 1]),
      };
      mockRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.findAll({ page: 1, limit: 10, search: 'test' });

      expect(queryBuilder.where).toHaveBeenCalledWith(
        'secret.name ILIKE :search OR secret.description ILIKE :search',
        { search: '%test%' },
      );
    });
  });

  describe('findOne', () => {
    it('should return a secret by id', async () => {
      mockRepository.findOne.mockResolvedValue(mockSecret);

      const result = await service.findOne('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toBeDefined();
      expect(result.id).toEqual(mockSecret.id);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: '123e4567-e89b-12d3-a456-426614174000' },
        relations: ['affectedServices'],
      });
    });

    it('should throw NotFoundException when secret not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const createSecretDto = {
      name: 'new-api-key',
      value: 'secret-value',
      type: SecretType.API_KEY,
      description: 'New API key',
    };

    it('should create a new secret', async () => {
      mockRepository.findOne.mockResolvedValue(null); // No existing secret
      mockRepository.create.mockReturnValue(mockSecret);
      mockRepository.save.mockResolvedValue(mockSecret);

      const result = await service.create(createSecretDto);

      expect(result).toBeDefined();
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('secret.created', expect.any(Object));
    });

    it('should throw BadRequestException when secret name already exists', async () => {
      mockRepository.findOne.mockResolvedValue(mockSecret);

      await expect(service.create(createSecretDto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const updateSecretDto = {
      description: 'Updated description',
    };

    it('should update a secret', async () => {
      mockRepository.findOne.mockResolvedValue(mockSecret);
      mockRepository.save.mockResolvedValue({ ...mockSecret, ...updateSecretDto });

      const result = await service.update('123e4567-e89b-12d3-a456-426614174000', updateSecretDto);

      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('secret.updated', expect.any(Object));
    });

    it('should throw NotFoundException when secret not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', updateSecretDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a secret', async () => {
      mockRepository.findOne.mockResolvedValue(mockSecret);
      mockRepository.remove.mockResolvedValue(mockSecret);

      await service.remove('123e4567-e89b-12d3-a456-426614174000');

      expect(mockRepository.remove).toHaveBeenCalledWith(mockSecret);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('secret.deleted', expect.any(Object));
    });

    it('should throw NotFoundException when secret not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.remove('non-existent-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('rotate', () => {
    const rotateSecretDto = {
      notifyServices: true,
    };

    it('should rotate a secret', async () => {
      const secretWithServices = {
        ...mockSecret,
        affectedServices: [
          {
            id: 'service-1',
            name: 'Test Service',
            endpoint: 'http://test-service.com/webhook',
          },
        ],
      };
      mockRepository.findOne.mockResolvedValue(secretWithServices);
      mockRepository.save.mockResolvedValue({
        ...secretWithServices,
        rotationCount: 1,
        lastRotatedAt: new Date(),
      });
      mockNotificationService.notifyServiceOfSecretRotation.mockResolvedValue(undefined);

      const result = await service.rotate('123e4567-e89b-12d3-a456-426614174000', rotateSecretDto);

      expect(result).toBeDefined();
      expect(result.rotationCount).toBe(1);
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockNotificationService.notifyServiceOfSecretRotation).toHaveBeenCalled();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith('secret.rotated', expect.any(Object));
    });

    it('should not notify services when notifyServices is false', async () => {
      mockRepository.findOne.mockResolvedValue(mockSecret);
      mockRepository.save.mockResolvedValue({
        ...mockSecret,
        rotationCount: 1,
      });

      await service.rotate('123e4567-e89b-12d3-a456-426614174000', {
        notifyServices: false,
      });

      expect(mockNotificationService.notifyServiceOfSecretRotation).not.toHaveBeenCalled();
    });

    it('should rollback on failure', async () => {
      mockRepository.findOne.mockResolvedValue(mockSecret);
      mockRepository.save
        .mockRejectedValueOnce(new Error('Save failed'))
        .mockResolvedValueOnce(mockSecret); // Rollback save

      await expect(
        service.rotate('123e4567-e89b-12d3-a456-426614174000', rotateSecretDto),
      ).rejects.toThrow('Save failed');

      expect(mockRepository.save).toHaveBeenCalledTimes(2); // Initial attempt + rollback
    });
  });

  describe('bulkRotate', () => {
    it('should rotate multiple secrets', async () => {
      const secretIds = ['id1', 'id2'];
      mockRepository.findOne
        .mockResolvedValueOnce(mockSecret)
        .mockResolvedValueOnce({ ...mockSecret, id: 'id2' });
      mockRepository.save
        .mockResolvedValueOnce({ ...mockSecret, rotationCount: 1 })
        .mockResolvedValueOnce({ ...mockSecret, id: 'id2', rotationCount: 1 });

      const results = await service.bulkRotate(secretIds, false);

      expect(results).toHaveLength(2);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'secrets.bulk_rotated',
        expect.objectContaining({
          successCount: 2,
          errorCount: 0,
        }),
      );
    });

    it('should handle partial failures in bulk rotation', async () => {
      const secretIds = ['id1', 'invalid-id'];
      mockRepository.findOne
        .mockResolvedValueOnce(mockSecret)
        .mockResolvedValueOnce(null); // Second secret not found
      mockRepository.save.mockResolvedValueOnce({ ...mockSecret, rotationCount: 1 });

      const results = await service.bulkRotate(secretIds, false);

      expect(results).toHaveLength(1);
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'secrets.bulk_rotated',
        expect.objectContaining({
          successCount: 1,
          errorCount: 1,
        }),
      );
    });
  });

  describe('getAffectedServices', () => {
    it('should return affected services for a secret', async () => {
      const secretWithServices = {
        ...mockSecret,
        affectedServices: [
          {
            id: 'service-1',
            name: 'Test Service',
            endpoint: 'http://test-service.com',
          },
        ],
      };
      mockRepository.findOne.mockResolvedValue(secretWithServices);

      const result = await service.getAffectedServices('123e4567-e89b-12d3-a456-426614174000');

      expect(result).toEqual({
        secretName: mockSecret.name,
        services: secretWithServices.affectedServices,
      });
    });

    it('should throw NotFoundException when secret not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(service.getAffectedServices('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});