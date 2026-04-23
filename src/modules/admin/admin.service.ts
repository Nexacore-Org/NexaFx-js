import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity, TransactionStatus } from '../transactions/entities/transaction.entity';
import { FeatureFlagEntity } from '../feature-flags/entities/feature-flag.entity';
import { RetryJobEntity } from '../retry/entities/retry-job.entity';
import { AdminAuditLogEntity } from '../admin-audit/entities/admin-audit-log.entity';
import { UserEntity } from '../users/entities/user.entity';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ToggleFeatureFlagDto } from './dto/toggle-feature-flag.dto';
import { RetryJobControlDto } from './dto/retry-job-control.dto';
import { AdminSearchUsersDto } from './dto/admin-search-users.dto';
import { AdminUpdateUserStatusDto } from './dto/admin-update-user-status.dto';
import { AdminBulkStatusDto } from './dto/admin-bulk-status.dto';
import { UsersService } from '../users/users.service';
import { AdminAuditService } from '../admin-audit/admin-audit.service';
import { ActorType } from '../admin-audit/entities/admin-audit-log.entity';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,

    @InjectRepository(FeatureFlagEntity)
    private readonly featureFlagRepo: Repository<FeatureFlagEntity>,

    @InjectRepository(RetryJobEntity)
    private readonly retryJobRepo: Repository<RetryJobEntity>,

    @InjectRepository(AdminAuditLogEntity)
    private readonly auditLogRepo: Repository<AdminAuditLogEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    private readonly usersService: UsersService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Metrics
  // ---------------------------------------------------------------------------

  async getMetrics() {
    const [
      totalTransactions,
      pendingTransactions,
      failedTransactions,
      totalRetryJobs,
      pendingRetryJobs,
      failedRetryJobs,
      totalFeatureFlags,
      enabledFeatureFlags,
      recentAuditLogs,
    ] = await Promise.all([
      this.transactionRepo.count(),
      this.transactionRepo.count({ where: { status: TransactionStatus.PENDING } }),
      this.transactionRepo.count({ where: { status: TransactionStatus.FAILED } }),
      this.retryJobRepo.count(),
      this.retryJobRepo.count({ where: { status: 'pending' } }),
      this.retryJobRepo.count({ where: { status: 'failed' } }),
      this.featureFlagRepo.count(),
      this.featureFlagRepo.count({ where: { enabled: true } }),
      this.auditLogRepo.count(),
    ]);

    return {
      transactions: {
        total: totalTransactions,
        pending: pendingTransactions,
        failed: failedTransactions,
      },
      retryJobs: {
        total: totalRetryJobs,
        pending: pendingRetryJobs,
        failed: failedRetryJobs,
      },
      featureFlags: {
        total: totalFeatureFlags,
        enabled: enabledFeatureFlags,
      },
      auditLogs: {
        total: recentAuditLogs,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // User management (issue #315)
  // ---------------------------------------------------------------------------

  async searchUsers(dto: AdminSearchUsersDto) {
    return this.usersService.adminSearchUsers({
      search: dto.search,
      role: dto.role,
      status: dto.status,
      page: dto.page ?? 1,
      limit: dto.limit ?? 20,
    });
  }

  async updateUserStatus(
    userId: string,
    adminId: string,
    dto: AdminUpdateUserStatusDto,
  ) {
    return this.usersService.adminUpdateUserStatus(
      userId,
      adminId,
      dto.status,
      dto.reason,
    );
  }

  async bulkUpdateUserStatus(adminId: string, dto: AdminBulkStatusDto) {
    return this.usersService.adminBulkUpdateStatus(
      dto.userIds,
      adminId,
      dto.status,
      dto.reason,
    );
  }

  // ---------------------------------------------------------------------------
  // User suspension (legacy — kept for backwards compatibility)
  // ---------------------------------------------------------------------------

  async suspendUser(userId: string, dto: SuspendUserDto, adminId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const before = { status: user.status };
    
    // We update the status based on suspension
    user.status = dto.suspended ? 'suspended' : 'active';
    const saved = await this.userRepo.save(user);

    await this.adminAuditService.logAction({
      actorId: adminId,
      actorType: ActorType.ADMIN,
      action: dto.suspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
      entity: 'User',
      entityId: userId,
      beforeSnapshot: before,
      afterSnapshot: { status: saved.status },
      description: dto.reason || (dto.suspended ? 'User suspended' : 'User unsuspended'),
    });

    return {
      userId,
      suspended: dto.suspended,
      reason: dto.reason,
    };
  }

  // ---------------------------------------------------------------------------
  // Transactions oversight
  // ---------------------------------------------------------------------------

  async getTransactions(page = 1, limit = 20, status?: string) {
    const qb = this.transactionRepo
      .createQueryBuilder('tx')
      .orderBy('tx.createdAt', 'DESC');

    if (status) {
      qb.where('tx.status = :status', { status });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async getTransactionById(id: string) {
    const tx = await this.transactionRepo.findOne({ where: { id } });
    if (!tx) throw new NotFoundException(`Transaction ${id} not found`);
    return tx;
  }

  // ---------------------------------------------------------------------------
  // Feature flag toggle
  // ---------------------------------------------------------------------------

  async toggleFeatureFlag(id: string, dto: ToggleFeatureFlagDto, adminId: string) {
    const flag = await this.featureFlagRepo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException(`Feature flag ${id} not found`);

    const before = { enabled: flag.enabled };
    flag.enabled = dto.enabled;
    const updated = await this.featureFlagRepo.save(flag);

    await this.adminAuditService.logAction({
      actorId: adminId,
      actorType: ActorType.ADMIN,
      action: 'TOGGLE_FEATURE_FLAG',
      entity: 'FeatureFlag',
      entityId: id,
      beforeSnapshot: before,
      afterSnapshot: { enabled: updated.enabled },
      description: `Feature flag ${flag.name} toggled to ${dto.enabled}`,
    });

    return updated;
  }

  async getFeatureFlags() {
    return this.featureFlagRepo.find({ order: { name: 'ASC' } });
  }

  // ---------------------------------------------------------------------------
  // Retry job control
  // ---------------------------------------------------------------------------

  async getRetryJobs(page = 1, limit = 20, status?: string) {
    const qb = this.retryJobRepo
      .createQueryBuilder('job')
      .orderBy('job.createdAt', 'DESC');

    if (status) {
      qb.where('job.status = :status', { status });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async controlRetryJob(id: string, dto: RetryJobControlDto, adminId: string) {
    const job = await this.retryJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Retry job ${id} not found`);

    if (job.status === 'succeeded' || job.status === 'running') {
      throw new BadRequestException(
        `Cannot change status of a job that is ${job.status}`,
      );
    }

    const before = { status: job.status };
    job.status = dto.status;
    const updated = await this.retryJobRepo.save(job);

    await this.adminAuditService.logAction({
      actorId: adminId,
      actorType: ActorType.ADMIN,
      action: 'CONTROL_RETRY_JOB',
      entity: 'RetryJob',
      entityId: id,
      beforeSnapshot: before,
      afterSnapshot: { status: updated.status },
      description: `Retry job ${id} status updated to ${dto.status}`,
    });

    return updated;
  }

  async triggerRetryJob(id: string, adminId: string) {
    const job = await this.retryJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Retry job ${id} not found`);

    if (job.status === 'running') {
      throw new BadRequestException('Job is already running');
    }

    const before = { status: job.status };
    job.status = 'pending';
    job.nextRunAt = new Date();
    const updated = await this.retryJobRepo.save(job);

    await this.adminAuditService.logAction({
      actorId: adminId,
      actorType: ActorType.ADMIN,
      action: 'TRIGGER_RETRY_JOB',
      entity: 'RetryJob',
      entityId: id,
      beforeSnapshot: before,
      afterSnapshot: { status: updated.status, nextRunAt: updated.nextRunAt },
      description: `Retry job ${id} manually triggered`,
    });

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Audit logs
  // ---------------------------------------------------------------------------

  async getAuditLogs(page = 1, limit = 20, actorId?: string, action?: string) {
    const qb = this.auditLogRepo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC');

    if (actorId) qb.andWhere('log.actorId = :actorId', { actorId });
    if (action)
      qb.andWhere('log.action ILIKE :action', { action: `%${action}%` });

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }
}
