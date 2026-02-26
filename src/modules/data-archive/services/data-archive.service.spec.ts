import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { DataArchiveService } from './data-archive.service';

describe('DataArchiveService', () => {
  let service: DataArchiveService;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };

  beforeEach(async () => {
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DataArchiveService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'archive.thresholdMonths') return 12;
              if (key === 'archive.batchSize') return 100;
              if (key === 'archive.enabled') return true;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<DataArchiveService>(DataArchiveService);
  });

  it('runs archival job and returns zero counts when no candidates exist', async () => {
    dataSource.transaction.mockImplementation(
      async (cb: (manager: { query: jest.Mock }) => Promise<any>) =>
        cb({
          query: jest
            .fn()
            .mockImplementation((sql: string) => {
              if (sql.includes('SELECT id') && sql.includes('FROM transactions')) {
                return [];
              }
              if (sql.includes('SELECT id') && sql.includes('FROM api_usage_logs')) {
                return [];
              }
              return [];
            }),
        }),
    );

    const result = await service.runArchivalJob();

    expect(result.archivedTransactions).toBe(0);
    expect(result.archivedTransactionSnapshots).toBe(0);
    expect(result.archivedTransactionRisks).toBe(0);
    expect(result.archivedApiUsageLogs).toBe(0);
  });

  it('returns paginated archived transactions', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([
        {
          originalId: '1f81f3fa-f770-4f3d-9fd1-6da2a533df22',
          sourceCreatedAt: new Date().toISOString(),
          archivedAt: new Date().toISOString(),
          data: { status: 'SUCCESS', currency: 'USD' },
        },
      ]);

    const result = await service.getArchivedTransactions({
      page: 1,
      limit: 20,
      sortOrder: 'desc',
    });

    expect(result.success).toBe(true);
    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('throws NotFoundException when restoring missing archived transaction', async () => {
    dataSource.transaction.mockImplementation(
      async (cb: (manager: { query: jest.Mock }) => Promise<any>) =>
        cb({
          query: jest.fn().mockResolvedValue([]),
        }),
    );

    await expect(
      service.restoreTransaction('d9916e82-b376-4cc5-9494-0f30199779e1', 'admin-1'),
    ).rejects.toThrow(NotFoundException);
  });
});
