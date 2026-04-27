import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { InboundWebhookLog, WebhookLogStatus } from '../entities/inbound-webhook-log.entity';
import { AdminGuard } from '../../auth/guards/admin.guard';

@ApiTags('Webhooks Admin')
@Controller('admin/webhooks')
@UseGuards(AdminGuard)
export class WebhooksAdminController {
  constructor(
    @InjectRepository(InboundWebhookLog)
    private readonly webhookLogRepo: Repository<InboundWebhookLog>,
  ) {}

  @Get('inbound')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List all received inbound webhook events' })
  @ApiQuery({ name: 'eventName', required: false, description: 'Filter by event name' })
  @ApiQuery({ name: 'status', required: false, enum: ['PROCESSING', 'PROCESSED', 'FAILED', 'UNHANDLED'], description: 'Filter by status' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Results per page (default: 20, max: 100)' })
  async getInboundWebhooks(
    @Query('eventName') eventName?: string,
    @Query('status') status?: WebhookLogStatus,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    // Validate and sanitize inputs
    page = Math.max(1, page);
    limit = Math.min(100, Math.max(1, limit));
    const offset = (page - 1) * limit;

    // Build query conditions
    const where: any = {};
    if (eventName) {
      where.eventName = Like(`%${eventName}%`);
    }
    if (status) {
      where.status = status;
    }

    // Execute query with pagination
    const [logs, total] = await this.webhookLogRepo.findAndCount({
      where,
      order: { receivedAt: 'DESC' },
      skip: offset,
      take: limit,
      select: [
        'id',
        'eventName',
        'deliveryId',
        'status',
        'processingResult',
        'processingTime',
        'receivedAt',
        'processedAt',
      ],
    });

    return {
      success: true,
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    };
  }

  @Get('inbound/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get inbound webhook statistics' })
  async getInboundWebhookStats() {
    const stats = await this.webhookLogRepo
      .createQueryBuilder('log')
      .select('log.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('log.status')
      .getRawMany();

    const total = await this.webhookLogRepo.count();
    const last24h = await this.webhookLogRepo.count({
      where: {
        receivedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const statusCounts = stats.reduce((acc, stat) => {
      acc[stat.status] = parseInt(stat.count, 10);
      return acc;
    }, {});

    return {
      success: true,
      data: {
        total,
        last24h,
        statusBreakdown: statusCounts,
        averageProcessingTime: await this.getAverageProcessingTime(),
      },
    };
  }

  private async getAverageProcessingTime(): Promise<number> {
    const result = await this.webhookLogRepo
      .createQueryBuilder('log')
      .select('AVG(log.processingTime)', 'avg')
      .where('log.processingTime IS NOT NULL')
      .getRawOne();

    return result?.avg ? Math.round(result.avg) : 0;
  }
}
