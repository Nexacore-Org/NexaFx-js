import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.indicator';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: HealthCheckService;
  let databaseIndicator: DatabaseHealthIndicator;

  beforeEach(async () => {
    const mockHealthCheckService = {
      check: jest.fn(),
    };

    const mockDatabaseIndicator = {
      isHealthy: jest.fn(),
      getDetails: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: DatabaseHealthIndicator,
          useValue: mockDatabaseIndicator,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get<HealthCheckService>(HealthCheckService);
    databaseIndicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
  });

  describe('getStatus', () => {
    it('should return healthy status when all checks pass', async () => {
      (healthCheckService.check as jest.Mock).mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up', responseTime: 5 } },
        error: {},
        details: { database: { status: 'up', responseTime: 5 } },
      });

      const result = await controller.getStatus();

      expect(result.status).toBe('healthy');
      expect(result.checks.database.status).toBe('up');
      expect(result.timestamp).toBeDefined();
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when database is down', async () => {
      const error = {
        response: {
          status: 'error',
          info: {},
          error: { database: { status: 'down', message: 'Connection refused' } },
          details: { database: { status: 'down', message: 'Connection refused' } },
        },
      };
      (healthCheckService.check as jest.Mock).mockRejectedValue(error);

      const result = await controller.getStatus();

      expect(result.status).toBe('unhealthy');
      expect(result.checks.database.status).toBe('down');
    });

    it('should include verbose details when verbose=true', async () => {
      (healthCheckService.check as jest.Mock).mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up', responseTime: 5 } },
        error: {},
        details: { database: { status: 'up', responseTime: 5 } },
      });

      (databaseIndicator.getDetails as jest.Mock).mockResolvedValue({
        status: 'up',
        responseTime: 5,
        type: 'postgres',
        database: 'nexafx_dev',
        isConnected: true,
      });

      const result = await controller.getStatus('true');

      expect(result.details).toBeDefined();
      expect(result.details?.database).toBeDefined();
      expect(result.details?.system).toBeDefined();
      expect(result.details?.environment).toBeDefined();
    });

    it('should not include verbose details by default', async () => {
      (healthCheckService.check as jest.Mock).mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      });

      const result = await controller.getStatus();

      expect(result.details).toBeUndefined();
    });

    it('should include version and uptime in response', async () => {
      (healthCheckService.check as jest.Mock).mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      });

      const result = await controller.getStatus();

      expect(result.version).toBeDefined();
      expect(typeof result.uptime).toBe('number');
    });

    it('should handle verbose=1 as true', async () => {
      (healthCheckService.check as jest.Mock).mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      });

      (databaseIndicator.getDetails as jest.Mock).mockResolvedValue({
        status: 'up',
        responseTime: 3,
      });

      const result = await controller.getStatus('1');

      expect(result.details).toBeDefined();
    });
  });
});
