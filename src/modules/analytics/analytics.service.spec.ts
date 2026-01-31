import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ApiUsageService } from './services/api-usage.service';
import { ApiUsageLogEntity } from './entities/api-usage-log.entity';

describe('API Usage Analytics (e2e)', () => {
  let service: ApiUsageService;
  let repository: any;

  beforeEach(async () => {
    const mockRepository = {
      insert: jest.fn().mockResolvedValue({}),
      find: jest.fn().mockResolvedValue([
        {
          route: '/api/transactions',
          method: 'GET',
          userId: 'user-1',
          durationMs: 100,
          statusCode: 200,
          createdAt: new Date(),
        },
        {
          route: '/api/transactions',
          method: 'POST',
          userId: 'user-1',
          durationMs: 250,
          statusCode: 201,
          createdAt: new Date(),
        },
        {
          route: '/api/webhooks',
          method: 'GET',
          userId: 'user-2',
          durationMs: 50,
          statusCode: 200,
          createdAt: new Date(),
        },
      ]),
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              route: '/api/transactions',
              method: 'GET',
              durationMs: 100,
              statusCode: 200,
            },
          ],
          1,
        ]),
      }),
      delete: jest.fn().mockResolvedValue({ affected: 15 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiUsageService,
        {
          provide: getRepositoryToken(ApiUsageLogEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<ApiUsageService>(ApiUsageService);
    repository = module.get(getRepositoryToken(ApiUsageLogEntity));
  });

  describe('logRequest', () => {
    it('should insert a log record', async () => {
      await service.logRequest({
        route: '/api/transactions',
        method: 'GET',
        userId: 'user-1',
        durationMs: 100,
        statusCode: 200,
      });

      expect(repository.insert).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      repository.insert.mockRejectedValueOnce(new Error('DB Error'));

      await expect(
        service.logRequest({
          route: '/api/transactions',
          method: 'GET',
          durationMs: 100,
          statusCode: 200,
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('getSummary', () => {
    it('should return aggregated analytics', async () => {
      const summary = await service.getSummary(24);

      expect(summary).toBeDefined();
      expect(summary.totalRequests).toBe(3);
      expect(summary.averageResponseTime).toBe((100 + 250 + 50) / 3);
      expect(summary.requestsByRoute).toBeDefined();
      expect(summary.requestsByStatusCode).toBeDefined();
      expect(summary.topUsers).toBeDefined();
    });

    it('should identify top users', async () => {
      const summary = await service.getSummary(24);

      expect(summary.topUsers).toContainEqual(
        expect.objectContaining({
          userId: 'user-1',
          requestCount: 2,
        }),
      );
    });

    it('should aggregate requests by route and method', async () => {
      const summary = await service.getSummary(24);

      expect(summary.requestsByRoute.length).toBeGreaterThan(0);
      expect(summary.requestsByRoute[0]).toHaveProperty('route');
      expect(summary.requestsByRoute[0]).toHaveProperty('method');
      expect(summary.requestsByRoute[0]).toHaveProperty('count');
      expect(summary.requestsByRoute[0]).toHaveProperty('avgDuration');
    });
  });

  describe('cleanupOldLogs', () => {
    it('should delete old logs', async () => {
      const deleted = await service.cleanupOldLogs(30);

      expect(repository.delete).toHaveBeenCalled();
      expect(deleted).toBe(15);
    });
  });

  describe('getRawLogs', () => {
    it('should retrieve logs with pagination', async () => {
      const result = await service.getRawLogs({
        limit: 100,
        offset: 0,
      });

      expect(result.items).toBeDefined();
      expect(result.total).toBe(1);
      expect(result.limit).toBe(100);
      expect(result.offset).toBe(0);
    });

    it('should filter by route', async () => {
      await service.getRawLogs({
        route: '/api/transactions',
      });

      expect(repository.createQueryBuilder).toHaveBeenCalled();
    });
  });
});
