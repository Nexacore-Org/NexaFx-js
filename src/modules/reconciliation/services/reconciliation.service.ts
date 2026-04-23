/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  ReconciliationIssueEntity,
  MismatchType,
} from '../entities/reconciliation-issue.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { ReconciliationIssueQueryDto } from '../dto/reconciliation-issue-query.dto';
import { BlockchainService } from '../../blockchain/blockchain.service';
import { AlertingService } from '../../risk-engine/services/alerting.service';
import { AdminAuditService } from '../../admin-audit/admin-audit.service';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly providerApiUrl: string;
  private readonly providerApiKey: string;
  private readonly providerApiTimeout: number;
  private readonly BACKLOG_THRESHOLD = 50;

  constructor(
    @InjectRepository(ReconciliationIssueEntity)
    private readonly issueRepo: Repository<ReconciliationIssueEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly httpService: HttpService,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
    private readonly alertingService: AlertingService,
    private readonly auditService: AdminAuditService,
  ) {
    this.providerApiUrl = this.configService.get<string>('PROVIDER_API_URL') || 'https://api.payment-provider.com';
    this.providerApiKey = this.configService.get<string>('PROVIDER_API_KEY') || '';
    this.providerApiTimeout = this.configService.get<number>('PROVIDER_API_TIMEOUT') || 30000;
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async runReconciliation(): Promise<void> {
    this.logger.log('Starting reconciliation run...');
    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);

    const pendingTxs = await this.txRepo
      .createQueryBuilder('t')
      .where('t.status = :status', { status: 'PENDING' })
      .andWhere('t.createdAt < :threshold', { threshold: staleThreshold })
      .getMany();

    this.logger.log(`Reconciling ${pendingTxs.length} stale pending transactions`);

    for (const tx of pendingTxs) {
      const providerStatus = await this.fetchProviderStatus(tx);
      const blockchainStatus = await this.fetchBlockchainStatus(tx);

      const providerMismatch = providerStatus !== null && providerStatus !== tx.status;
      const blockchainMismatch = blockchainStatus !== null && blockchainStatus !== tx.status;

      if (!providerMismatch && !blockchainMismatch) continue;

      const mismatchType: MismatchType = providerMismatch && blockchainMismatch
        ? 'BOTH_MISMATCH'
        : providerMismatch ? 'PROVIDER_MISMATCH' : 'BLOCKCHAIN_MISMATCH';

      const resolvedStatus = this.deriveResolution(providerStatus, blockchainStatus);

      const issue = this.issueRepo.create({
        transactionId: tx.id,
        mismatchType,
        internalStatus: tx.status,
        providerStatus: providerStatus ?? undefined,
        blockchainStatus: blockchainStatus ?? undefined,
        rawSnapshot: { tx, providerStatus, blockchainStatus },
      });

      if (resolvedStatus) {
        await this.txRepo.update(tx.id, { status: resolvedStatus });
        issue.status = 'AUTO_RESOLVED';
        issue.resolution = `Auto-resolved to ${resolvedStatus} based on external consensus`;
      } else {
        issue.status = 'ESCALATED';
        issue.resolution = 'No consensus — manual review required';
      }

      await this.issueRepo.save(issue);
    }

    await this.checkBacklogThreshold();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async checkBacklogThreshold() {
    const backlogCount = await this.issueRepo.count({
      where: [{ status: 'OPEN' }, { status: 'ESCALATED' }]
    });

    if (backlogCount > this.BACKLOG_THRESHOLD) {
      await this.alertingService.sendReconciliationAlert(
        `High reconciliation backlog detected: ${backlogCount} issues pending.`,
        backlogCount
      );
    }
  }

  async getIssues(query: ReconciliationIssueQueryDto) {
    const { page = 1, limit = 20, status, mismatchType, transactionId, startDate, endDate } = query;
    const qb = this.issueRepo.createQueryBuilder('i').orderBy('i.createdAt', 'DESC');

    if (status) qb.andWhere('i.status = :status', { status });
    if (mismatchType) qb.andWhere('i.mismatchType = :mismatchType', { mismatchType });
    if (transactionId) qb.andWhere('i.transactionId = :transactionId', { transactionId });
    if (startDate && endDate) {
      qb.andWhere('i.createdAt BETWEEN :startDate AND :endDate', {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
      });
    }

    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async resolveIssue(issueId: string, resolution: string, adminId: string, context?: any) {
    const issue = await this.issueRepo.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Reconciliation issue not found');

    const beforeSnapshot = { ...issue };
    issue.status = 'AUTO_RESOLVED'; // Using AUTO_RESOLVED as a generic terminal resolved state for now, or could add 'RESOLVED'
    issue.resolution = `Manual resolution by admin: ${resolution}`;
    
    const savedIssue = await this.issueRepo.save(issue);

    await this.auditService.logAdminAction(
      {
        actorId: adminId,
        actorType: context?.actorType || 'ADMIN',
        ip: context?.ip,
        userAgent: context?.userAgent,
      },
      {
        action: 'RESOLVE_RECONCILIATION_ISSUE',
        entity: 'ReconciliationIssue',
        entityId: issueId,
        beforeSnapshot,
        afterSnapshot: savedIssue,
        description: `Resolved reconciliation issue ${issueId} with note: ${resolution}`,
      }
    );

    return savedIssue;
  }

  private async fetchProviderStatus(tx: TransactionEntity): Promise<string | null> {
    if (!tx.externalId) return null;
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.providerApiUrl}/transactions/${tx.externalId}`, {
          headers: { Authorization: `Bearer ${this.providerApiKey}` },
          timeout: this.providerApiTimeout,
        }),
      );
      return this.normalizeProviderStatus(response.data.status || response.data.state);
    } catch (error) {
      return null;
    }
  }

  private async fetchBlockchainStatus(tx: TransactionEntity): Promise<string | null> {
    const txHash = tx.metadata?.txHash;
    if (!txHash) return null;
    try {
      return await this.blockchainService.getTransactionStatus(txHash);
    } catch (error) {
      return null;
    }
  }

  private normalizeProviderStatus(providerStatus: string): string | null {
    const statusMap: Record<string, string> = {
      PENDING: 'PENDING', COMPLETED: 'SUCCESS', SUCCEEDED: 'SUCCESS', SUCCESS: 'SUCCESS',
      FAILED: 'FAILED', FAILURE: 'FAILED', CANCELLED: 'CANCELLED', PROCESSING: 'PENDING',
    };
    return statusMap[providerStatus.toUpperCase()] || null;
  }

  private deriveResolution(providerStatus: string | null, blockchainStatus: string | null): 'SUCCESS' | 'FAILED' | null {
    const candidates = [providerStatus, blockchainStatus].filter(Boolean);
    if (candidates.length === 0) return null;
    const allAgree = candidates.every((s) => s === candidates[0]);
    if (allAgree && ['SUCCESS', 'FAILED'].includes(candidates[0]!)) {
      return candidates[0] as 'SUCCESS' | 'FAILED';
    }
    return null;
  }
}
