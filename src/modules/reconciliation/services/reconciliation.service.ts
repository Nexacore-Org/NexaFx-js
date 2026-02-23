/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ReconciliationIssueEntity,
  MismatchType,
} from '../entities/reconciliation-issue.entity';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { ReconciliationIssueQueryDto } from '../dto/reconciliation-issue-query.dto';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(ReconciliationIssueEntity)
    private readonly issueRepo: Repository<ReconciliationIssueEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /**
   * Main reconciliation job — runs every 15 minutes.
   * Scans PENDING transactions older than 5 minutes and
   * checks for provider/blockchain mismatches.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runReconciliation(): Promise<void> {
    this.logger.log('Starting reconciliation run...');

    const staleThreshold = new Date(Date.now() - 5 * 60 * 1000);

    const pendingTxs = await this.txRepo
      .createQueryBuilder('t')
      .where('t.status = :status', { status: 'PENDING' })
      .andWhere('t.createdAt < :threshold', { threshold: staleThreshold })
      .getMany();

    this.logger.log(
      `Reconciling ${pendingTxs.length} stale pending transactions`,
    );

    let flagged = 0;
    let autoResolved = 0;
    let escalated = 0;

    for (const tx of pendingTxs) {
      const providerStatus = await this.fetchProviderStatus(tx);
      const blockchainStatus = await this.fetchBlockchainStatus(tx);

      const providerMismatch =
        providerStatus !== null && providerStatus !== tx.status;
      const blockchainMismatch =
        blockchainStatus !== null && blockchainStatus !== tx.status;

      if (!providerMismatch && !blockchainMismatch) continue;

      flagged++;
      const mismatchType: MismatchType =
        providerMismatch && blockchainMismatch
          ? 'BOTH_MISMATCH'
          : providerMismatch
            ? 'PROVIDER_MISMATCH'
            : 'BLOCKCHAIN_MISMATCH';

      // Attempt auto-resolution: if both provider and blockchain agree on a terminal state
      const resolvedStatus = this.deriveResolution(
        providerStatus,
        blockchainStatus,
      );

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
        autoResolved++;
      } else {
        issue.status = 'ESCALATED';
        issue.resolution = 'No consensus — manual review required';
        escalated++;
      }

      await this.issueRepo.save(issue);
    }

    this.logger.log(
      `Reconciliation complete — flagged: ${flagged}, auto-resolved: ${autoResolved}, escalated: ${escalated}`,
    );
  }

  async getIssues(query: ReconciliationIssueQueryDto) {
    const { page = 1, limit = 20, status } = query;
    const qb = this.issueRepo
      .createQueryBuilder('i')
      .orderBy('i.createdAt', 'DESC');

    if (status) {
      qb.where('i.status = :status', { status });
    }

    qb.skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Stub: replace with real HTTP call to payment provider API.
   */
  private async fetchProviderStatus(
    tx: TransactionEntity,
  ): Promise<string | null> {
    if (!tx.externalId) return null;
    // TODO: inject HttpService and call provider API using tx.externalId
    return null;
  }

  /**
   * Stub: replace with real blockchain RPC confirmation check.
   */
  private async fetchBlockchainStatus(
    tx: TransactionEntity,
  ): Promise<string | null> {
    const txHash = tx.metadata?.txHash;
    if (!txHash) return null;
    // TODO: call blockchain node RPC for confirmation count
    return null;
  }

  /**
   * Returns a resolved status if provider and blockchain agree on a terminal state.
   */
  private deriveResolution(
    providerStatus: string | null,
    blockchainStatus: string | null,
  ): 'SUCCESS' | 'FAILED' | null {
    const terminalStates = ['SUCCESS', 'FAILED'];
    const candidates = [providerStatus, blockchainStatus].filter(Boolean);

    if (candidates.length === 0) return null;

    const allAgree = candidates.every((s) => s === candidates[0]);
    if (allAgree && terminalStates.includes(candidates[0]!)) {
      return candidates[0] as 'SUCCESS' | 'FAILED';
    }

    return null;
  }
}
