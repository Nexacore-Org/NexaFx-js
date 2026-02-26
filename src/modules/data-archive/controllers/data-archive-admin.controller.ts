import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AuditLog } from '../../admin-audit/decorators/audit-log.decorator';
import { DataArchiveService } from '../services/data-archive.service';
import { QueryArchivedTransactionsDto } from '../dto/query-archived-transactions.dto';
import { QueryArchivedApiLogsDto } from '../dto/query-archived-api-logs.dto';

@Controller('admin/archive')
@UseGuards(JwtAuthGuard, AdminGuard)
export class DataArchiveAdminController {
  constructor(private readonly dataArchiveService: DataArchiveService) {}

  @Get('transactions')
  getArchivedTransactions(@Query() query: QueryArchivedTransactionsDto) {
    return this.dataArchiveService.getArchivedTransactions(query);
  }

  @Get('transactions/:id')
  getArchivedTransactionById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.dataArchiveService.getArchivedTransactionById(id);
  }

  @Post('transactions/:id/restore')
  @AuditLog({
    action: 'RESTORE_ARCHIVED_TRANSACTION',
    entity: 'Transaction',
    entityIdParam: 'id',
    description: 'Admin restored an archived transaction',
  })
  restoreArchivedTransaction(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
  ) {
    const restoredBy = req.user?.id ?? 'system';
    return this.dataArchiveService.restoreTransaction(id, restoredBy);
  }

  @Get('api-usage-logs')
  getArchivedApiUsageLogs(@Query() query: QueryArchivedApiLogsDto) {
    return this.dataArchiveService.getArchivedApiUsageLogs(query);
  }

  @Post('api-usage-logs/:id/restore')
  @AuditLog({
    action: 'RESTORE_ARCHIVED_API_USAGE_LOG',
    entity: 'ApiUsageLog',
    entityIdParam: 'id',
    description: 'Admin restored an archived API usage log',
  })
  restoreArchivedApiUsageLog(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Request() req: any,
  ) {
    const restoredBy = req.user?.id ?? 'system';
    return this.dataArchiveService.restoreApiUsageLog(id, restoredBy);
  }

  @Post('run')
  @AuditLog({
    action: 'RUN_ARCHIVE_JOB',
    entity: 'DataArchive',
    description: 'Admin triggered data archive job manually',
  })
  runArchiveNow() {
    return this.dataArchiveService.runArchivalJob();
  }
}
