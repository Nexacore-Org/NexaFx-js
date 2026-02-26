import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { InsightsService } from './insights.service';
import { AggregationService } from './services/aggregation.service';
import { DataRetentionService } from './services/data-retention.service';
import {
  GetInsightsQueryDto,
  InsightsSummaryResponseDto,
} from './dto/insights.dto';

/**
 * Admin-only controller for platform insights
 * 
 * IMPORTANT: You must implement and apply your authentication guards here
 * Examples:
 * - @UseGuards(JwtAuthGuard, AdminRoleGuard)
 * - @UseGuards(ApiKeyGuard, AdminPermissionGuard)
 * 
 * Never expose these endpoints without proper authentication!
 */
@ApiTags('Admin - Insights')
@Controller('admin/insights')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard, AdminRoleGuard) // Uncomment and implement your guards
export class InsightsController {
  constructor(
    private readonly insightsService: InsightsService,
    private readonly aggregationService: AggregationService,
    private readonly dataRetentionService: DataRetentionService,
  ) {}

  /**
   * GET /admin/insights/summary
   * Returns aggregated platform insights
   */
  @Get('summary')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get aggregated platform insights',
    description:
      'Returns anonymized aggregate statistics including transaction volume, ' +
      'active users, and revenue metrics. No PII is exposed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Insights retrieved successfully',
    type: InsightsSummaryResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing authentication',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Insufficient permissions (admin only)',
  })
  async getSummary(
    @Query() query: GetInsightsQueryDto,
  ): Promise<InsightsSummaryResponseDto> {
    return this.insightsService.getInsightsSummary(query);
  }

  /**
   * GET /admin/insights/privacy-metadata
   * Returns privacy and anonymization metadata
   */
  @Get('privacy-metadata')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get privacy and anonymization metadata',
    description:
      'Returns information about anonymization techniques, k-anonymity thresholds, ' +
      'and data retention policies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Privacy metadata retrieved successfully',
  })
  async getPrivacyMetadata() {
    return {
      ...this.insightsService.getPrivacyMetadata(),
      retentionPolicies: this.dataRetentionService.getRetentionPolicies(),
    };
  }

  /**
   * GET /admin/insights/aggregation-jobs
   * Returns aggregation job history
   */
  @Get('aggregation-jobs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get aggregation job history',
    description: 'Returns the history of aggregation jobs for monitoring purposes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Aggregation job history retrieved successfully',
  })
  async getAggregationJobs(@Query('limit') limit?: number) {
    return this.aggregationService.getJobHistory(limit || 50);
  }

  /**
   * GET /admin/insights/expiring-records
   * Returns count of records that will be purged
   */
  @Get('expiring-records')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get count of expiring records',
    description:
      'Returns the count of aggregated records that are scheduled for purging ' +
      'based on retention policies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Expiring records count retrieved successfully',
  })
  async getExpiringRecords() {
    return this.dataRetentionService.getExpiringRecordsCount();
  }

  /**
   * GET /admin/insights/health
   * Health check endpoint
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Health check for insights service',
    description: 'Returns the health status of the insights service.',
  })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
  })
  async healthCheck() {
    return {
      status: 'healthy',
      timestamp: new Date(),
      service: 'insights',
    };
  }
}