import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  UseGuards,
  Request,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ToggleFeatureFlagDto } from './dto/toggle-feature-flag.dto';
import { RetryJobControlDto } from './dto/retry-job-control.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  @Get('metrics')
  @SkipAudit()
  getMetrics() {
    return this.adminService.getMetrics();
  }

  // ---------------------------------------------------------------------------
  // Users
  // ---------------------------------------------------------------------------

  @Patch('users/:id/suspend')
  @AuditLog({
    action: 'SUSPEND_USER',
    entity: 'User',
    entityIdParam: 'id',
    description: 'Admin updated user suspension status',
  })
  suspendUser(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SuspendUserDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.id ?? 'system';
    return this.adminService.suspendUser(id, dto, adminId);
  }

  // ---------------------------------------------------------------------------
  // Transactions
  // ---------------------------------------------------------------------------

  @Get('transactions')
  @SkipAudit()
  getTransactions(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.adminService.getTransactions(
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get('transactions/:id')
  @SkipAudit()
  getTransaction(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.getTransactionById(id);
  }

  // ---------------------------------------------------------------------------
  // Feature flags
  // ---------------------------------------------------------------------------

  @Get('feature-flags')
  @SkipAudit()
  getFeatureFlags() {
    return this.adminService.getFeatureFlags();
  }

  @Patch('feature-flags/:id/toggle')
  @AuditLog({
    action: 'TOGGLE_FEATURE_FLAG',
    entity: 'FeatureFlag',
    entityIdParam: 'id',
    description: 'Admin toggled a feature flag',
  })
  toggleFeatureFlag(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ToggleFeatureFlagDto,
  ) {
    return this.adminService.toggleFeatureFlag(id, dto);
  }

  // ---------------------------------------------------------------------------
  // Retry jobs
  // ---------------------------------------------------------------------------

  @Get('retry-jobs')
  @SkipAudit()
  getRetryJobs(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('status') status?: string,
  ) {
    return this.adminService.getRetryJobs(Number(page), Number(limit), status);
  }

  @Patch('retry-jobs/:id/control')
  @AuditLog({
    action: 'CONTROL_RETRY_JOB',
    entity: 'RetryJob',
    entityIdParam: 'id',
    description: 'Admin updated retry job status',
  })
  controlRetryJob(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RetryJobControlDto,
  ) {
    return this.adminService.controlRetryJob(id, dto);
  }

  @Post('retry-jobs/:id/trigger')
  @AuditLog({
    action: 'TRIGGER_RETRY_JOB',
    entity: 'RetryJob',
    entityIdParam: 'id',
    description: 'Admin manually triggered a retry job',
  })
  triggerRetryJob(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.adminService.triggerRetryJob(id);
  }

  // ---------------------------------------------------------------------------
  // Audit logs
  // ---------------------------------------------------------------------------

  @Get('audit-logs')
  @SkipAudit()
  getAuditLogs(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
  ) {
    return this.adminService.getAuditLogs(
      Number(page),
      Number(limit),
      actorId,
      action,
    );
  }
}
