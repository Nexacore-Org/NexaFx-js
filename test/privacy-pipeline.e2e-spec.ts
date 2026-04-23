import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AggregationService } from '../src/exxagerated/services/aggregation.service';
import { AnonymizationValidatorService } from '../src/exxagerated/services/anonymization-validator.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataLineage } from '../src/exxagerated/entities/data-lineage.entity';
import { DataSource } from 'typeorm';

describe('Privacy-Safe Analytics Pipeline (e2e)', () => {
  let app: INestApplication;
  let aggregationService: AggregationService;
  let validatorService: AnonymizationValidatorService;
  let dataSource: DataSource;

  const mockLineageRepo = {
    create: jest.fn().mockImplementation(dto => dto),
    save: jest.fn().mockImplementation(log => Promise.resolve({ id: 'uuid', ...log })),
    find: jest.fn(),
  };

  const mockDataSource = {
    query: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(getRepositoryToken(DataLineage))
      .useValue(mockLineageRepo)
      .overrideProvider(DataSource)
      .useValue(mockDataSource)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    aggregationService = moduleFixture.get<AggregationService>(AggregationService);
    validatorService = moduleFixture.get<AnonymizationValidatorService>(AnonymizationValidatorService);
    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  it('should abort aggregation if PII is detected', async () => {
    const rawDataWithPII = [{ id: 1, amount: 100, email: 'test@example.com' }];
    mockDataSource.query.mockResolvedValueOnce(rawDataWithPII);

    await expect(aggregationService.runDailyVolumeAggregation()).rejects.toThrow(
      InternalServerErrorException,
    );

    expect(mockLineageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        piiFieldsDetected: ['email'],
        anonymizationApplied: false,
      }),
    );
  });

  it('should abort aggregation if threshold is not met', async () => {
    const rawDataLowCount = Array(5).fill({ id: 1, amount: 100 }); // Below threshold of 10
    mockDataSource.query.mockResolvedValueOnce(rawDataLowCount);

    await expect(aggregationService.runDailyVolumeAggregation()).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should succeed and log lineage on clean data', async () => {
    const cleanData = Array(15).fill({ id: 1, amount: 100 });
    mockDataSource.query.mockResolvedValueOnce(cleanData); // Fetch
    mockDataSource.query.mockResolvedValueOnce({ affected: 1 }); // Insert

    const result = await aggregationService.runDailyVolumeAggregation();

    expect(result).toBeDefined();
    expect(mockLineageRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        piiFieldsDetected: [],
        anonymizationApplied: true,
        rowsProcessed: 15,
      }),
    );
  });

  it('GET /admin/analytics/lineage should return audit trail', async () => {
    const mockHistory = [{ jobId: '123', jobName: 'daily_volume' }];
    mockLineageRepo.find.mockResolvedValueOnce(mockHistory);

    const response = await request(app.getHttpServer())
      .get('/admin/analytics/lineage')
      .expect(200);

    expect(response.body).toEqual(mockHistory);
  });
});
