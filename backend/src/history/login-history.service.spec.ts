import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginHistoryService } from './login-history.service';
import { LoginHistory } from './login-history.entity';

describe('LoginHistoryService', () => {
  let service: LoginHistoryService;
  let repository: Repository<LoginHistory>;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findAndCount: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginHistoryService,
        {
          provide: getRepositoryToken(LoginHistory),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<LoginHistoryService>(LoginHistoryService);
    repository = module.get<Repository<LoginHistory>>(getRepositoryToken(LoginHistory));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a login history record', async () => {
      const createDto = {
        userId: 1,
        email: 'test@example.com',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        isSuccessful: true,
      };

      const mockLoginHistory = { id: 1, ...createDto, createdAt: new Date() };
      
      mockRepository.create.mockReturnValue(mockLoginHistory);
      mockRepository.save.mockResolvedValue(mockLoginHistory);

      const result = await service.create(createDto);

      expect(mockRepository.create).toHaveBeenCalledWith(createDto);
      expect(mockRepository.save).toHaveBeenCalledWith(mockLoginHistory);
      expect(result).toEqual(mockLoginHistory);
    });
  });

  describe('findByUserId', () => {
    it('should return paginated login history for a user', async () => {
      const userId = 1;
      const query = { page: 1, limit: 10 };
      const mockData = [
        { id: 1, userId, email: 'test@example.com', isSuccessful: true },
        { id: 2, userId, email: 'test@example.com', isSuccessful: false },
      ];

      mockRepository.findAndCount.mockResolvedValue([mockData, 2]);

      const result = await service.findByUserId(userId, query);

      expect(result).toEqual({
        data: mockData,
        total: 2,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('getRecentFailedAttempts', () => {
    it('should count recent failed attempts for an email', async () => {
      const email = 'test@example.com';
      mockRepository.count.mockResolvedValue(3);

      const result = await service.getRecentFailedAttempts(email, 15);

      expect(result).toBe(3);
      expect(mockRepository.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            email,
            isSuccessful: false,
          }),
        })
      );
    });
  });
});
