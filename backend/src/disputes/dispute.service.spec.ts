import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DisputeService } from './services/dispute.service';
import { S3Service } from './services/s3.service';
import { FraudDetectionService } from './services/fraud-detection.service';
import {
  Dispute,
  DisputeState,
  DisputeCategory,
  DisputePriority,
} from './entities/dispute.entity';
import { User } from './entities/user.entity';
import { Transaction } from './entities/transaction.entity';
import { Evidence } from './entities/evidence.entity';
import { Comment } from './entities/comment.entity';
import { TimelineEntry } from './entities/timeline-entry.entity';
import { AuditLog } from './entities/audit-log.entity';

describe('DisputeService', () => {
  let service: DisputeService;

  const mockDisputeRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockTransactionRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockEvidenceRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockCommentRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockTimelineRepository = {
    save: jest.fn(),
  };

  const mockAuditRepository = {
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockS3Service = {
    uploadFile: jest.fn(),
    generateEvidenceKey: jest.fn(),
  };

  const mockFraudDetectionService = {
    analyzeDispute: jest.fn(),
    updateDisputeFraudScore: jest.fn(),
  };

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: mockDisputeRepository,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: mockTransactionRepository,
        },
        {
          provide: getRepositoryToken(Evidence),
          useValue: mockEvidenceRepository,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepository,
        },
        {
          provide: getRepositoryToken(TimelineEntry),
          useValue: mockTimelineRepository,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditRepository,
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
        {
          provide: FraudDetectionService,
          useValue: mockFraudDetectionService,
        },
        {
          provide: getQueueToken('dispute'),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken('notification'),
          useValue: mockQueue,
        },
        {
          provide: getQueueToken('ocr'),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<DisputeService>(DisputeService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createDispute', () => {
    it('should create a dispute successfully', async () => {
      const createDisputeDto = {
        transactionId: 'txn-123',
        category: DisputeCategory.UNAUTHORIZED_TRANSACTION,
        description: 'Test dispute',
        amountNaira: '50000',
      };

      const userId = 'user-123';
      const transaction = {
        id: 'txn-123',
        userId: 'user-123',
        amountNaira: '50000',
        user: { tier: 2 },
      };

      const dispute = {
        id: 'dispute-123',
        ...createDisputeDto,
        userId,
        state: DisputeState.OPEN,
        priority: DisputePriority.MEDIUM,
        slaDeadline: new Date(),
      };

      mockTransactionRepository.findOne.mockResolvedValue(transaction);
      mockDisputeRepository.findOne.mockResolvedValue(null);
      mockDisputeRepository.create.mockReturnValue(dispute);
      mockDisputeRepository.save.mockResolvedValue(dispute);
      mockTimelineRepository.save.mockResolvedValue({});
      mockAuditRepository.create.mockReturnValue({});
      mockAuditRepository.save.mockResolvedValue({});

      const result = await service.createDispute(createDisputeDto, userId);

      expect(mockTransactionRepository.findOne).toHaveBeenCalledWith({
        where: { id: createDisputeDto.transactionId, userId },
        relations: ['user'],
      });
      expect(mockDisputeRepository.create).toHaveBeenCalled();
      expect(mockDisputeRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException when transaction not found', async () => {
      const createDisputeDto = {
        transactionId: 'txn-123',
        category: DisputeCategory.UNAUTHORIZED_TRANSACTION,
        description: 'Test dispute',
        amountNaira: '50000',
      };

      const userId = 'user-123';

      mockTransactionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.createDispute(createDisputeDto, userId),
      ).rejects.toThrow('Transaction not found or access denied');
    });

    it('should throw BadRequestException when dispute already exists', async () => {
      const createDisputeDto = {
        transactionId: 'txn-123',
        category: DisputeCategory.UNAUTHORIZED_TRANSACTION,
        description: 'Test dispute',
        amountNaira: '50000',
      };

      const userId = 'user-123';
      const transaction = {
        id: 'txn-123',
        userId: 'user-123',
        amountNaira: '50000',
        user: { tier: 2 },
      };

      const existingDispute = {
        id: 'existing-dispute',
        transactionId: 'txn-123',
        state: DisputeState.OPEN,
      };

      mockTransactionRepository.findOne.mockResolvedValue(transaction);
      mockDisputeRepository.findOne.mockResolvedValue(existingDispute);

      await expect(
        service.createDispute(createDisputeDto, userId),
      ).rejects.toThrow('Dispute already exists for this transaction');
    });
  });

  describe('findOne', () => {
    it('should return a dispute when found', async () => {
      const disputeId = 'dispute-123';
      const dispute = {
        id: disputeId,
        transactionId: 'txn-123',
        userId: 'user-123',
        category: DisputeCategory.UNAUTHORIZED_TRANSACTION,
        state: DisputeState.OPEN,
      };

      mockDisputeRepository.findOne.mockResolvedValue(dispute);

      const result = await service.findOne(disputeId);

      expect(mockDisputeRepository.findOne).toHaveBeenCalledWith({
        where: { id: disputeId },
        relations: [
          'transaction',
          'user',
          'assignedTo',
          'evidences',
          'comments',
          'timeline',
        ],
      });
      expect(result).toEqual(dispute);
    });

    it('should throw NotFoundException when dispute not found', async () => {
      const disputeId = 'dispute-123';

      mockDisputeRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(disputeId)).rejects.toThrow(
        'Dispute not found',
      );
    });
  });

  describe('uploadEvidence', () => {
    it('should upload evidence files successfully', async () => {
      const disputeId = 'dispute-123';
      const userId = 'user-123';
      const files = [
        {
          originalname: 'receipt.jpg',
          mimetype: 'image/jpeg',
          size: 1024,
          buffer: Buffer.from('mock-file-data'),
        } as Express.Multer.File,
      ];

      const dispute = {
        id: disputeId,
        transactionId: 'txn-123',
        userId: 'user-123',
        state: DisputeState.OPEN,
      };

      const evidence = {
        id: 'evidence-123',
        disputeId,
        uploaderId: userId,
        s3Key: 'evidence/dispute-123/file.jpg',
        filename: 'receipt.jpg',
        mimeType: 'image/jpeg',
        size: 1024,
      };

      mockDisputeRepository.findOne.mockResolvedValue(dispute);
      mockS3Service.generateEvidenceKey.mockReturnValue(
        'evidence/dispute-123/file.jpg',
      );
      mockS3Service.uploadFile.mockResolvedValue({
        key: 'evidence/dispute-123/file.jpg',
        url: 'https://s3.url',
      });
      mockEvidenceRepository.create.mockReturnValue(evidence);
      mockEvidenceRepository.save.mockResolvedValue(evidence);
      mockTimelineRepository.save.mockResolvedValue({});

      const result = await service.uploadEvidence(disputeId, files, userId);

      expect(mockS3Service.generateEvidenceKey).toHaveBeenCalledWith(
        disputeId,
        files[0].originalname,
      );
      expect(mockS3Service.uploadFile).toHaveBeenCalledWith(
        files[0],
        `evidence/${disputeId}`,
        expect.objectContaining({
          disputeId,
          uploaderId: userId,
          originalFilename: files[0].originalname,
        }),
      );
      expect(mockEvidenceRepository.create).toHaveBeenCalled();
      expect(mockEvidenceRepository.save).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('calculatePriority', () => {
    it('should return CRITICAL for amounts > 100,000', () => {
      const result = service['calculatePriority'](150000, 2);
      expect(result).toBe(DisputePriority.CRITICAL);
    });

    it('should return CRITICAL for tier 3 users', () => {
      const result = service['calculatePriority'](10000, 3);
      expect(result).toBe(DisputePriority.CRITICAL);
    });

    it('should return HIGH for amounts > 50,000', () => {
      const result = service['calculatePriority'](75000, 2);
      expect(result).toBe(DisputePriority.HIGH);
    });

    it('should return MEDIUM for other cases', () => {
      const result = service['calculatePriority'](25000, 2);
      expect(result).toBe(DisputePriority.MEDIUM);
    });
  });

  describe('calculateSlaDeadline', () => {
    it('should calculate SLA deadline correctly', () => {
      const priority = DisputePriority.MEDIUM;

      const result = service['calculateSlaDeadline'](priority);

      expect(result).toBeInstanceOf(Date);
      expect(result.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
