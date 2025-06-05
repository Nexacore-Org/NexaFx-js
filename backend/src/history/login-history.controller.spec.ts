import { Test, TestingModule } from '@nestjs/testing';
import { LoginHistoryController } from './login-history.controller';
import { LoginHistoryService } from './login-history.service';

describe('LoginHistoryController', () => {
  let controller: LoginHistoryController;
  let service: LoginHistoryService;

  const mockService = {
    create: jest.fn(),
    findByUserId: jest.fn(),
    getLoginStats: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LoginHistoryController],
      providers: [
        {
          provide: LoginHistoryService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<LoginHistoryController>(LoginHistoryController);
    service = module.get<LoginHistoryService>(LoginHistoryService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getMyLoginHistory', () => {
    it('should return user login history', async () => {
      const mockRequest = { user: { userId: 1, email: 'test@example.com' } };
      const mockQuery = { page: 1, limit: 10 };
      const mockResult = { data: [], total: 0, page: 1, limit: 10 };

      mockService.findByUserId.mockResolvedValue(mockResult);

      const result = await controller.getMyLoginHistory(mockRequest as any, mockQuery);

      expect(service.findByUserId).toHaveBeenCalledWith(1, mockQuery);
      expect(result).toEqual(mockResult);
    });
  });
});
