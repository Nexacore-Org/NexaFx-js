import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';
import { Response } from 'express';
import { AuditExportFormat, AuditExportService, AUDIT_EXPORT_FORMATS } from '../audit/audit-export.service';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

export class AuditExportQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;

  @IsOptional()
  @IsIn(AUDIT_EXPORT_FORMATS)
  format: AuditExportFormat = 'csv';
}

@ApiTags('Admin audit')
@ApiBearerAuth('access-token')
@Controller('admin/audit-logs')
@UseGuards(JwtAuthGuard, AdminRoleGuard)
export class AuditExportController {
  constructor(
    private readonly exportService: AuditExportService,
    private readonly auditService: AuditService,
  ) {}

  @Get('export')
  @ApiOperation({ summary: 'Export the audit trail as CSV, JSON or PDF' })
  @ApiOkResponse({ description: 'Streamed audit export' })
  async export(
    @Query(ValidationPipe) query: AuditExportQueryDto,
    @CurrentUser('id') userId: string,
    @Res() res: Response,
  ) {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (from > to) {
      throw new BadRequestException('from must be before or equal to to');
    }

    await this.auditService.log({
      userId,
      action: 'audit.export',
      entityType: 'audit_log',
      after: { from: from.toISOString(), to: to.toISOString(), format: query.format },
    });

    await this.exportService.streamExport(res, from, to, query.format);
  }
}
