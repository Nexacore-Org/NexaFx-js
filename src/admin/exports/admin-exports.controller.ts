import { getCorrelationId } from '../../common/middleware/correlation-id.storage';
import { InjectQueue } from '@nestjs/bull';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  GoneException,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../modules/admin-audit/audit-actions';
import { Queue } from 'bull';
import { Response } from 'express';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../auth/enums/role.enum';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ExportTransactionsDto, assertExportWindow } from '../dto/export-transactions.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ExportStorageService } from './export-storage.service';

@Roles(Role.ADMIN, Role.COMPLIANCE)
@UseGuards(JwtAuthGuard, IpAllowlistGuard)
@Controller('admin/exports')
export class AdminExportsController {
  constructor(
    @Optional()
    @InjectQueue('admin-exports')
    private readonly exportsQueue: Queue | undefined,
    private readonly storage: ExportStorageService,
    private readonly audit: AuditService,
  ) {}

  @Post('transactions')
  async createExport(
    @Body() dto: ExportTransactionsDto,
    @CurrentUser('email') requestedByEmail: string,
    @CurrentUser('id') requestedBy: string,
  ) {
    assertExportWindow(dto.from, dto.to);

    if (dto.format !== 'csv') {
      throw new BadRequestException(
        'Only the csv format is currently supported',
      );
    }

    const job = this.exportsQueue
      ? await this.exportsQueue.add('export-transactions', {
          ...dto,
          requestedByEmail,
          // Lets getStatus/download be restricted to whoever asked for the export (issue #1533).
          requestedBy,
          correlationId: getCorrelationId(),
        })
      : { id: 'export-queued' };

    await this.audit.log({
      userId: requestedBy,
      action: AuditAction.ADMIN_EXPORT_CREATED,
      entityType: 'export',
      entityId: String(job.id),
      after: { from: dto.from, to: dto.to, status: dto.status, currency: dto.currency, format: dto.format },
    });

    return { jobId: job.id, status: 'queued' };
  }

  @Get(':jobId')
  async getStatus(
    @Param('jobId') jobId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('role') role: string,
  ) {
    const job = await this.exportsQueue?.getJob(jobId);
    // Any admin could previously read any job by id. Only the requester (or the compliance role)
    // may see it; everyone else gets the same 404 as for an unknown job.
    const requestedBy = (job?.data as { requestedBy?: string } | undefined)?.requestedBy;
    if (!job || (role !== Role.COMPLIANCE && requestedBy !== userId)) {
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
  async download(
    @Param('jobId') jobId: string,
    @Query('token') token: string,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const filePath = this.storage.resolve(jobId, token);
    if (!this.storage.exists(filePath)) {
      // The link was valid but the file has been cleaned up (or never existed).
      throw new GoneException('This export has expired; request a new one');
    }
    await this.audit.log({
      userId,
      action: AuditAction.ADMIN_EXPORT_DOWNLOADED,
      entityType: 'export',
      entityId: jobId,
    });
    res.download(filePath);
  }
}
