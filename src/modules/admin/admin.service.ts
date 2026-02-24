import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { FeatureFlagEntity } from '../feature-flags/entities/feature-flag.entity';
import { RetryJobEntity } from '../retry/entities/retry-job.entity';
import { AdminAuditLogEntity } from '../admin-audit/entities/admin-audit-log.entity';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ToggleFeatureFlagDto } from './dto/toggle-feature-flag.dto';
import { RetryJobControlDto } from './dto/retry-job-control.dto';

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
      this.transactionRepo.count({ where: { status: 'pending' } }),
      this.transactionRepo.count({ where: { status: 'failed' } }),
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
  // User suspension
  // ---------------------------------------------------------------------------

  async suspendUser(userId: string, dto: SuspendUserDto, adminId: string) {
    // Update all active transactions for this user to reflect suspension if needed.
    // The user entity itself is expected to be managed by the UsersService / UsersModule.
    // Here we delegate to a raw update so we don't need to import the UserEntity directly
    // — which avoids circular dependencies. If you have a UsersService exported you can
    // inject it instead.
    const result = await this.transactionRepo.manager.query(
      `UPDATE users SET is_suspended = $1, suspension_reason = $2, updated_at = NOW() WHERE id = $3 RETURNING id`,
      [dto.suspended, dto.reason ?? null, userId],
    );

    if (!result[1] || result[1] === 0) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    const action = dto.suspended ? 'SUSPEND_USER' : 'UNSUSPEND_USER';
    this.logger.log(`Admin ${adminId} performed ${action} on user ${userId}`);

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

  async toggleFeatureFlag(id: string, dto: ToggleFeatureFlagDto) {
    const flag = await this.featureFlagRepo.findOne({ where: { id } });
    if (!flag) throw new NotFoundException(`Feature flag ${id} not found`);

    flag.enabled = dto.enabled;
    const updated = await this.featureFlagRepo.save(flag);

    this.logger.log(`Feature flag ${flag.name} toggled to ${dto.enabled}`);
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

  async controlRetryJob(id: string, dto: RetryJobControlDto) {
    const job = await this.retryJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Retry job ${id} not found`);

    if (job.status === 'succeeded' || job.status === 'running') {
      throw new BadRequestException(
        `Cannot change status of a job that is ${job.status}`,
      );
    }

    job.status = dto.status;
    const updated = await this.retryJobRepo.save(job);

    this.logger.log(`Retry job ${id} status updated to ${dto.status}`);
    return updated;
  }

  async triggerRetryJob(id: string) {
    const job = await this.retryJobRepo.findOne({ where: { id } });
    if (!job) throw new NotFoundException(`Retry job ${id} not found`);

    if (job.status === 'running') {
      throw new BadRequestException('Job is already running');
    }

    job.status = 'pending';
    job.nextRunAt = new Date();
    const updated = await this.retryJobRepo.save(job);

    this.logger.log(`Retry job ${id} manually triggered`);
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
