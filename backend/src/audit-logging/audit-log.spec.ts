import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog, AuditActionType } from './audit-log.entity';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repository: Repository<AuditLog>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repository = module.get<Repository<AuditLog>>(getRepositoryToken(AuditLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create an audit log', async () => {
    const createDto = {
      actionType: AuditActionType.LOGIN,
      userId: 'test-user-id',
      userEmail: 'test@example.com',
    };

    const mockAuditLog = { id: 'test-id', ...createDto };
    mockRepository.create.mockReturnValue(mockAuditLog);
    mockRepository.save.mockResolvedValue(mockAuditLog);

    const result = await service.createLog(createDto);

    expect(mockRepository.create).toHaveBeenCalledWith(createDto);
    expect(mockRepository.save).toHaveBeenCalledWith(mockAuditLog);
    expect(result).toEqual(mockAuditLog);
  });

  it('should log user action', async () => {
    const mockAuditLog = {
      id: 'test-id',
      actionType: AuditActionType.USER_UPDATE,
      userId: 'test-user-id',
    };

    mockRepository.create.mockReturnValue(mockAuditLog);
    mockRepository.save.mockResolvedValue(mockAuditLog);

    const result = await service.logUserAction(
      AuditActionType.USER_UPDATE,
      'test-user-id',
      { description: 'Test update' },
    );

    expect(result).toEqual(mockAuditLog);
  });
});
