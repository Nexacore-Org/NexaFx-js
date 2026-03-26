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
import { AdminSearchUsersDto } from './dto/admin-search-users.dto';
import { AdminUpdateUserStatusDto } from './dto/admin-update-user-status.dto';
import { AdminBulkStatusDto } from './dto/admin-bulk-status.dto';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AuditLog } from '../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../admin-audit/decorators/skip-audit.decorator';
import { ActivityTimelineService } from '../users/services/activity-timeline.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly activityTimelineService: ActivityTimelineService,
  ) {}

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  @Get('metrics')
  @SkipAudit()
  getMetrics() {
    return this.adminService.getMetrics();
  }

  // ---------------------------------------------------------------------------
  // Users (issue #315)
  // ---------------------------------------------------------------------------

  @Get('users')
  @SkipAudit()
  searchUsers(@Query() dto: AdminSearchUsersDto) {
    return this.adminService.searchUsers(dto);
  }

  @Patch('users/:id/status')
  @AuditLog({
    action: 'UPDATE_USER_STATUS',
    entity: 'User',
    entityIdParam: 'id',
    description: 'Admin updated user status',
  })
  updateUserStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminUpdateUserStatusDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.id ?? 'system';
    return this.adminService.updateUserStatus(id, adminId, dto);
  }

  @Post('users/bulk-status')
  @AuditLog({
    action: 'BULK_UPDATE_USER_STATUS',
    entity: 'User',
    description: 'Admin bulk updated user statuses',
  })
  bulkUpdateUserStatus(@Body() dto: AdminBulkStatusDto, @Request() req: any) {
    const adminId = req.user?.id ?? 'system';
    return this.adminService.bulkUpdateUserStatus(adminId, dto);
  }

  @Get('users/:id/activity')
  @SkipAudit()
  getUserActivity(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityTimelineService.getTimeline(id, {
      cursor,
      limit: limit ? Number(limit) : 20,
      adminView: true,
    });
  }

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
