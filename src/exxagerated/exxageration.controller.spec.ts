import { Test, TestingModule } from '@nestjs/testing';
import { InsightsController } from '../insights.controller';
import { InsightsService } from '../services/insights.service';
import { AggregationService } from '../services/aggregation.service';
import { DataRetentionService } from '../services/data-retention.service';
import { TimeRangeEnum } from '../dto/insights.dto';

describe('InsightsController', () => {
  let controller: InsightsController;
  let insightsService: InsightsService;
  let aggregationService: AggregationService;
  let dataRetentionService: DataRetentionService;

  const mockInsightsService = {
    getInsightsSummary: jest.fn(),
    getPrivacyMetadata: jest.fn(),
  };

  const mockAggregationService = {
    getJobHistory: jest.fn(),
  };

  const mockDataRetentionService = {
    getRetentionPolicies: jest.fn(),
    getExpiringRecordsCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InsightsController],
      providers: [
        {
          provide: InsightsService,
          useValue: mockInsightsService,
        },
        {
          provide: AggregationService,
          useValue: mockAggregationService,
        },
        {
          provide: DataRetentionService,
          useValue: mockDataRetentionService,
        },
      ],
    }).compile();

    controller = module.get<InsightsController>(InsightsController);
    insightsService = module.get<InsightsService>(InsightsService);
    aggregationService = module.get<AggregationService>(AggregationService);
    dataRetentionService = module.get<DataRetentionService>(
      DataRetentionService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getSummary', () => {
    it('should return insights summary', async () => {
      const mockSummary = {
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-07'),
          label: 'Last 7 Days',
        },
        transactions: {
          totalCount: 1000,
          totalVolume: 50000,
          averageValue: 50,
          successfulCount: 950,
          failedCount: 50,
          successRate: 95,
          periodOverPeriodChange: 10,
        },
        users: {
          activeUsers: 500,
          newUsers: 100,
          returningUsers: 400,
          averageSessionDuration: 1200,
          retentionRate: 80,
          periodOverPeriodChange: 5,
        },
        revenue: {
          totalRevenue: 48000,
          averageRevenuePerUser: 96,
          totalFees: 2000,
          periodOverPeriodChange: 8,
        },
        transactionTimeSeries: [],
        userTimeSeries: [],
        lastAggregatedAt: new Date(),
        privacyNotice:
          'All data is aggregated and anonymized. No personal information is included.',
      };

      mockInsightsService.getInsightsSummary.mockResolvedValue(mockSummary);

      const query = {
        timeRange: TimeRangeEnum.LAST_7_DAYS,
      };

      const result = await controller.getSummary(query);

      expect(result).toEqual(mockSummary);
      expect(insightsService.getInsightsSummary).toHaveBeenCalledWith(query);
    });

    it('should handle custom time range', async () => {
      const mockSummary = {
        timeRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
          label: 'Custom Range',
        },
        transactions: expect.any(Object),
        users: expect.any(Object),
        revenue: expect.any(Object),
        transactionTimeSeries: [],
        userTimeSeries: [],
        lastAggregatedAt: new Date(),
        privacyNotice: expect.any(String),
      };

      mockInsightsService.getInsightsSummary.mockResolvedValue(mockSummary);

      const query = {
        timeRange: TimeRangeEnum.CUSTOM,
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      };

      const result = await controller.getSummary(query);

      expect(result).toBeDefined();
      expect(insightsService.getInsightsSummary).toHaveBeenCalledWith(query);
    });
  });

  describe('getPrivacyMetadata', () => {
    it('should return privacy metadata with retention policies', async () => {
      const mockPrivacyMetadata = {
        anonymizationVersion: '1.0.0',
        kAnonymityThreshold: 10,
        privacyNotice: 'All metrics are aggregated...',
        dataRetentionPolicy: 'Aggregated metrics are retained...',
      };

      const mockRetentionPolicies = {
        hourly: 7,
        daily: 90,
        weekly: 365,
        monthly: 1095,
      };

      mockInsightsService.getPrivacyMetadata.mockReturnValue(
        mockPrivacyMetadata,
      );
      mockDataRetentionService.getRetentionPolicies.mockReturnValue(
        mockRetentionPolicies,
      );

      const result = await controller.getPrivacyMetadata();

      expect(result).toEqual({
        ...mockPrivacyMetadata,
        retentionPolicies: mockRetentionPolicies,
      });
      expect(insightsService.getPrivacyMetadata).toHaveBeenCalled();
      expect(dataRetentionService.getRetentionPolicies).toHaveBeenCalled();
    });
  });

  describe('getAggregationJobs', () => {
    it('should return aggregation job history with default limit', async () => {
      const mockJobs = [
        {
          id: '1',
          periodType: 'daily',
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date('2024-01-02'),
          status: 'completed',
          startedAt: new Date(),
          completedAt: new Date(),
        },
      ];

      mockAggregationService.getJobHistory.mockResolvedValue(mockJobs);

      const result = await controller.getAggregationJobs();

      expect(result).toEqual(mockJobs);
      expect(aggregationService.getJobHistory).toHaveBeenCalledWith(50);
    });

    it('should return aggregation job history with custom limit', async () => {
      const mockJobs = [];
      mockAggregationService.getJobHistory.mockResolvedValue(mockJobs);

      const result = await controller.getAggregationJobs(100);

      expect(result).toEqual(mockJobs);
      expect(aggregationService.getJobHistory).toHaveBeenCalledWith(100);
    });
  });

  describe('getExpiringRecords', () => {
    it('should return count of expiring records', async () => {
      const mockCounts = {
        transactions: 150,
        users: 200,
        revenue: 175,
      };

      mockDataRetentionService.getExpiringRecordsCount.mockResolvedValue(
        mockCounts,
      );

      const result = await controller.getExpiringRecords();

      expect(result).toEqual(mockCounts);
      expect(dataRetentionService.getExpiringRecordsCount).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result).toHaveProperty('status', 'healthy');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('service', 'insights');
      expect(result.timestamp).toBeInstanceOf(Date);
    });
  });
});