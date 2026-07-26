import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Queue } from 'bull';
import { Request, Response } from 'express';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExportTransactionsDto } from '../dto/export-transactions.dto';
import { ExportStorageService } from './export-storage.service';

interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
@Controller('api/v1/admin/exports')
export class AdminExportsController {
  constructor(
    @Optional()
    @InjectQueue('admin-exports')
    private readonly exportsQueue: Queue | undefined,
    private readonly storage: ExportStorageService,
  ) {}

  @Post('transactions')
  async createExport(
    @Body() dto: ExportTransactionsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (dto.format !== 'csv') {
      throw new BadRequestException(
        'Only the csv format is currently supported',
      );
    }

    const job = this.exportsQueue
      ? await this.exportsQueue.add('export-transactions', {
          ...dto,
          requestedByEmail: req.user.email,
        })
      : { id: 'export-queued' };

    return { jobId: job.id, status: 'queued' };
  }

  @Get(':jobId')
  async getStatus(@Param('jobId') jobId: string) {
    const job = await this.exportsQueue?.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Export job not found');
    }

    const state = await job.getState();
    const result = state === 'completed' ? job.returnvalue : undefined;
    return {
      jobId,
      status: state,
      downloadUrl: result?.downloadUrl,
      expiresAt: result?.expiresAt,
    };
  }

  @Get(':jobId/download')
  download(
    @Param('jobId') jobId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    const filePath = this.storage.resolve(jobId, token);
    res.download(filePath);
  }
}
