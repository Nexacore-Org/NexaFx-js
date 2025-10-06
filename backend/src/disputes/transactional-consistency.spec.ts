import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { DataSource, QueryRunner } from 'typeorm';
import { DisputeService } from './services/dispute.service';
import { Dispute, DisputeState } from './entities/dispute.entity';
import { Transaction } from './entities/transaction.entity';
import { Evidence } from './entities/evidence.entity';
import { S3Service } from './services/s3.service';

describe('DisputeService - Transactional Consistency', () => {
  let service: DisputeService;
  let mockQueryRunner: Partial<QueryRunner>;
  let mockDataSource: Partial<DataSource>;

  const mockTransaction: Partial<Transaction> = {
    id: 'test-transaction-id',
    userId: 'test-user-id',
    amountNaira: '10000',
    user: { id: 'test-user-id', tier: 1 },
  };

  const mockFile: Express.Multer.File = {
    fieldname: 'evidenceFiles',
    originalname: 'test.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('test content'),
    stream: null,
    destination: '',
    filename: '',
    path: '',
  };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      manager: {
        findOne: jest.fn(),
        create: jest.fn(),
        save: jest.fn(),
      },
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DisputeService,
        {
          provide: getRepositoryToken(Dispute),
          useValue: {},
        },
        {
          provide: getRepositoryToken('User'),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: {},
        },
        {
          provide: getRepositoryToken(Evidence),
          useValue: {},
        },
        {
          provide: getRepositoryToken('Comment'),
          useValue: {},
        },
        {
          provide: getRepositoryToken('TimelineEntry'),
          useValue: {},
        },
        {
          provide: getRepositoryToken('AuditLog'),
          useValue: {},
        },
        {
          provide: getQueueToken('dispute'),
          useValue: { add: jest.fn() },
        },
        {
          provide: getQueueToken('notification'),
          useValue: { add: jest.fn() },
        },
        {
          provide: getQueueToken('ocr'),
          useValue: { add: jest.fn() },
        },
        {
          provide: S3Service,
          useValue: {
            generateEvidenceKey: jest.fn().mockReturnValue('test-s3-key'),
            uploadFile: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<DisputeService>(DisputeService);
  });

  describe('createDisputeWithEvidence', () => {
    it('should successfully create dispute with evidence in transaction', async () => {
      const createDisputeDto = {
        transactionId: 'test-transaction-id',
        category: 'unauthorized_transaction',
        description: 'Test dispute',
        amountNaira: '5000',
      };

      // Mock transaction lookup
      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockTransaction) // Transaction lookup
        .mockResolvedValueOnce(null); // No existing dispute

      // Mock dispute creation
      const mockDispute = { id: 'test-dispute-id', ...createDisputeDto };
      (mockQueryRunner.manager.create as jest.Mock).mockReturnValue(
        mockDispute,
      );
      (mockQueryRunner.manager.save as jest.Mock)
        .mockResolvedValueOnce(mockDispute) // Save dispute
        .mockResolvedValueOnce({}) // Save timeline entry
        .mockResolvedValueOnce({}); // Save audit log

      const result = await service.createDisputeWithEvidence(
        createDisputeDto,
        [mockFile],
        'test-user-id',
      );

      expect(result).toEqual(mockDispute);
      expect(mockQueryRunner.connect).toHaveBeenCalled();
      expect(mockQueryRunner.startTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should rollback transaction when evidence upload fails', async () => {
      const createDisputeDto = {
        transactionId: 'test-transaction-id',
        category: 'unauthorized_transaction',
        description: 'Test dispute',
        amountNaira: '5000',
      };

      // Mock transaction lookup
      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockTransaction) // Transaction lookup
        .mockResolvedValueOnce(null); // No existing dispute

      // Mock dispute creation
      const mockDispute = { id: 'test-dispute-id', ...createDisputeDto };
      (mockQueryRunner.manager.create as jest.Mock).mockReturnValue(
        mockDispute,
      );
      (mockQueryRunner.manager.save as jest.Mock).mockResolvedValueOnce(
        mockDispute,
      );

      // Mock S3 upload failure
      const s3Service = service['s3Service'];
      jest
        .spyOn(s3Service, 'uploadFile')
        .mockRejectedValue(new Error('S3 upload failed'));

      await expect(
        service.createDisputeWithEvidence(
          createDisputeDto,
          [mockFile],
          'test-user-id',
        ),
      ).rejects.toThrow('S3 upload failed');

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('should rollback transaction when transaction not found', async () => {
      const createDisputeDto = {
        transactionId: 'invalid-transaction-id',
        category: 'unauthorized_transaction',
        description: 'Test dispute',
        amountNaira: '5000',
      };

      // Mock transaction not found
      (mockQueryRunner.manager.findOne as jest.Mock).mockResolvedValueOnce(
        null,
      );

      await expect(
        service.createDisputeWithEvidence(createDisputeDto, [], 'test-user-id'),
      ).rejects.toThrow(NotFoundException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('should rollback transaction when dispute already exists', async () => {
      const createDisputeDto = {
        transactionId: 'test-transaction-id',
        category: 'unauthorized_transaction',
        description: 'Test dispute',
        amountNaira: '5000',
      };

      // Mock transaction lookup and existing dispute
      (mockQueryRunner.manager.findOne as jest.Mock)
        .mockResolvedValueOnce(mockTransaction) // Transaction lookup
        .mockResolvedValueOnce({ id: 'existing-dispute' }); // Existing dispute found

      await expect(
        service.createDisputeWithEvidence(createDisputeDto, [], 'test-user-id'),
      ).rejects.toThrow(BadRequestException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });
});
