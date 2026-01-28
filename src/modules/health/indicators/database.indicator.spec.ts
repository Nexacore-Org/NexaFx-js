import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { DataSource } from 'typeorm';
import { DatabaseHealthIndicator } from './database.indicator';

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let dataSource: DataSource;

  beforeEach(async () => {
    const mockDataSource = {
      query: jest.fn(),
      options: {
        type: 'postgres',
        database: 'nexafx_dev',
      },
      isInitialized: true,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthIndicator,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    indicator = module.get<DatabaseHealthIndicator>(DatabaseHealthIndicator);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('isHealthy', () => {
    it('should return healthy status when database responds', async () => {
      (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      const result = await indicator.isHealthy('database');

      expect(result.database.status).toBe('up');
      expect(result.database.responseTime).toBeDefined();
    });

    it('should throw HealthCheckError when database is unreachable', async () => {
      (dataSource.query as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(indicator.isHealthy('database')).rejects.toThrow(
        HealthCheckError,
      );
    });

    it('should include response time in healthy status', async () => {
      (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      const result = await indicator.isHealthy('database');

      expect(typeof result.database.responseTime).toBe('number');
      expect(result.database.responseTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getDetails', () => {
    it('should return detailed database info when healthy', async () => {
      (dataSource.query as jest.Mock).mockResolvedValue([{ '?column?': 1 }]);

      const details = await indicator.getDetails();

      expect(details.status).toBe('up');
      expect(details.type).toBe('postgres');
      expect(details.database).toBe('nexafx_dev');
      expect(details.isConnected).toBe(true);
      expect(details.responseTime).toBeDefined();
    });

    it('should return error details when database is down', async () => {
      (dataSource.query as jest.Mock).mockRejectedValue(
        new Error('Connection refused'),
      );

      const details = await indicator.getDetails();

      expect(details.status).toBe('down');
      expect(details.message).toBe('Connection refused');
      expect(details.isConnected).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      (dataSource.query as jest.Mock).mockRejectedValue('Unknown error');

      const details = await indicator.getDetails();

      expect(details.status).toBe('down');
      expect(details.message).toBe('Database connection failed');
    });
  });
});
