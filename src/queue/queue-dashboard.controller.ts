import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { QueueService } from './queue.service';
import { QUEUE_NAMES } from './queue.constants';
import { JobType } from 'bullmq';

// Replace with your actual guards
class BasicAuthGuard {}

@ApiTags('Queue Dashboard')
@ApiBearerAuth()
// @UseGuards(BasicAuthGuard)  // Uncomment when guard is wired up
@Controller('queue-dashboard')
export class QueueDashboardController {
  constructor(private readonly queueService: QueueService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get stats for all queues' })
  async getAllStats() {
    return this.queueService.getAllQueueStats();
  }

  @Get('stats/:queueName')
  @ApiOperation({ summary: 'Get stats for a specific queue' })
  @ApiParam({ name: 'queueName', enum: Object.values(QUEUE_NAMES) })
  async getQueueStats(@Param('queueName') queueName: string) {
    return this.queueService.getQueueStats(queueName);
  }

  @Get(':queueName/failed')
  @ApiOperation({ summary: 'List failed jobs' })
  @ApiQuery({ name: 'start', required: false, type: Number })
  @ApiQuery({ name: 'end', required: false, type: Number })
  async getFailedJobs(
    @Param('queueName') queueName: string,
    @Query('start', new DefaultValuePipe(0), ParseIntPipe) start: number,
    @Query('end', new DefaultValuePipe(49), ParseIntPipe) end: number,
  ) {
    const jobs = await this.queueService.getFailedJobs(queueName, start, end);
    return jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));
  }

  @Post(':queueName/jobs/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a specific failed job' })
  async retryJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
  ) {
    await this.queueService.retryFailedJob(queueName, jobId);
    return { message: `Job ${jobId} queued for retry` };
  }

  @Post(':queueName/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause a queue' })
  async pauseQueue(@Param('queueName') queueName: string) {
    await this.queueService.pauseQueue(queueName);
    return { message: `Queue ${queueName} paused` };
  }

  @Post(':queueName/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume a paused queue' })
  async resumeQueue(@Param('queueName') queueName: string) {
    await this.queueService.resumeQueue(queueName);
    return { message: `Queue ${queueName} resumed` };
  }

  @Delete(':queueName/clean')
  @ApiOperation({ summary: 'Clean jobs from a queue' })
  @ApiQuery({ name: 'grace', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['completed', 'failed', 'delayed', 'active', 'wait'],
  })
  async cleanQueue(
    @Param('queueName') queueName: string,
    @Query('grace', new DefaultValuePipe(0), ParseIntPipe) grace: number,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('type') type: JobType = 'completed',
  ) {
    const removed = await this.queueService.cleanQueue(
      queueName,
      grace,
      limit,
      type,
    );
    return { message: `Cleaned ${removed.length} jobs from ${queueName}` };
  }
}
