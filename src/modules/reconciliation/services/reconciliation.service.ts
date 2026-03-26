/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/require-await */
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);
  private readonly providerApiUrl: string;
  private readonly providerApiKey: string;
  private readonly providerApiTimeout: number;

  constructor(
    @InjectRepository(ReconciliationIssueEntity)
    private readonly issueRepo: Repository<ReconciliationIssueEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly httpService: HttpService,
    private readonly blockchainService: BlockchainService,
    private readonly configService: ConfigService,
  ) {
    // Read provider API configuration from environment variables
    this.providerApiUrl =
      this.configService.get<string>('PROVIDER_API_URL') ||
      'https://api.payment-provider.com';
    this.providerApiKey =
      this.configService.get<string>('PROVIDER_API_KEY') || '';
    this.providerApiTimeout =
      this.configService.get<number>('PROVIDER_API_TIMEOUT') || 30000;

    if (!this.providerApiKey) {
      this.logger.warn(
        'PROVIDER_API_KEY not configured. Provider status checks will fail.',
      );
    }
  }

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
   * Fetch real payment provider transaction status using externalId
   * Makes HTTP call to provider API and returns transaction status
   */
  private async fetchProviderStatus(
    tx: TransactionEntity,
  ): Promise<string | null> {
    if (!tx.externalId) {
      this.logger.debug(
        `Transaction ${tx.id} has no externalId, skipping provider check`,
      );
      return null;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.providerApiUrl}/transactions/${tx.externalId}`,
          {
            headers: {
              Authorization: `Bearer ${this.providerApiKey}`,
              'Content-Type': 'application/json',
            },
            timeout: this.providerApiTimeout,
          },
        ),
      );

      const providerData = response.data;

      // Map provider status to our standard statuses
      // Provider likely returns: PENDING, COMPLETED, FAILED, CANCELLED
      const status = providerData.status || providerData.state;

      if (!status) {
        this.logger.warn(
          `Provider API returned no status for transaction ${tx.id}`,
        );
        return null;
      }

      // Normalize provider status to our standard format
      const normalizedStatus = this.normalizeProviderStatus(status);
      this.logger.debug(
        `Provider status for ${tx.id}: ${status} → ${normalizedStatus}`,
      );

      return normalizedStatus;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch provider status for transaction ${tx.id} (external: ${tx.externalId}):`,
        error.message,
      );
      // Return null on error to avoid false positives
      return null;
    }
  }

  /**
   * Fetch blockchain transaction status using txHash in metadata
   * Calls blockchain RPC to check confirmation status
   */
  private async fetchBlockchainStatus(
    tx: TransactionEntity,
  ): Promise<string | null> {
    const txHash = tx.metadata?.txHash;
    if (!txHash) {
      this.logger.debug(
        `Transaction ${tx.id} has no txHash in metadata, skipping blockchain check`,
      );
      return null;
    }

    try {
      const status = await this.blockchainService.getTransactionStatus(txHash);

      if (!status) {
        this.logger.debug(
          `Transaction ${txHash} not yet confirmed on blockchain`,
        );
        return null;
      }

      this.logger.debug(
        `Blockchain status for ${tx.id} (hash: ${txHash}): ${status}`,
      );
      return status;
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch blockchain status for transaction ${tx.id} (hash: ${txHash}):`,
        error.message,
      );
      // Return null on error to avoid false positives
      return null;
    }
  }

  /**
   * Normalize provider status to standard transaction statuses
   */
  private normalizeProviderStatus(providerStatus: string): string | null {
    const statusMap: Record<string, string> = {
      PENDING: 'PENDING',
      COMPLETED: 'SUCCESS',
      SUCCEEDED: 'SUCCESS',
      SUCCESS: 'SUCCESS',
      FAILED: 'FAILED',
      FAILURE: 'FAILED',
      CANCELLED: 'CANCELLED',
      CANCEL: 'CANCELLED',
      PROCESSING: 'PENDING',
    };

    const normalized = statusMap[providerStatus.toUpperCase()];
    return normalized || null;
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
