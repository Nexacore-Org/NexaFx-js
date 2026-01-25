import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { RetryJobEntity } from './entities/retry-job.entity';
import { RetryService } from './retry.services';
import { AdminGuard } from '../auth/guards/admin.guard'; // adjust path to your guard

@Controller('admin/retry-jobs')
@UseGuards(AdminGuard)
export class AdminRetryController {
  constructor(
    @InjectRepository(RetryJobEntity)
    private readonly retryRepo: Repository<RetryJobEntity>,
    private readonly retryService: RetryService,
  ) {}

  @Get()
  async list() {
    const items = await this.retryRepo.find({
      order: { createdAt: 'DESC' },
      take: 200,
    });

    return { success: true, data: items };
  }

  @Post(':id/run')
  async run(@Param('id') id: string) {
    const result = await this.retryService.runJob(id);
    return { success: true, data: result };
  }
}
