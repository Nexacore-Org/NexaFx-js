import { TransactionExecutionSnapshotEntity } from '../entities/transaction-execution-snapshot.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { CreateTransactionDto } from '../dto/create-transaction.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { WalletAliasService } from './wallet-alias.service';
import { TransactionLifecycleService } from './transaction-lifecycle.service';
import { RiskScoringService } from './risk-scoring.service';
import { FxAggregatorService } from '../../fx/fx-aggregator.service';
import { WebhookDispatcherService } from '../../webhooks/webhook-dispatcher.service';
import { AdminAuditService, AuditContext } from '../../admin-audit/admin-audit.service';
import { ActorType } from '../../admin-audit/entities/admin-audit-log.entity';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'NGN', 'JPY', 'BTC', 'ETH', 'USDT'];

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly enrichmentService: EnrichmentService,
    private readonly walletAliasService: WalletAliasService,
    private readonly lifecycleService: TransactionLifecycleService,
    private readonly riskScoringService: RiskScoringService,
    private readonly fxAggregatorService: FxAggregatorService,
    private readonly webhookDispatcher: WebhookDispatcherService,
    private readonly adminAuditService: AdminAuditService,
  ) {}

  async createTransaction(dto: CreateTransactionDto, auditContext?: AuditContext) {
    if (!SUPPORTED_CURRENCIES.includes(dto.currency.toUpperCase())) {
      throw new Error(`Unsupported currency: ${dto.currency}`);
    }

    let exchangeRate: number | undefined;
    let convertedAmount: number | undefined;
    let fxConversionId: string | undefined;

    if (dto.targetCurrency && dto.targetCurrency.toUpperCase() !== dto.currency.toUpperCase()) {
      const pair = `${dto.currency.toUpperCase()}/${dto.targetCurrency.toUpperCase()}`;
      exchangeRate = await this.fxAggregatorService.getValidatedRate(pair);
      convertedAmount = Number((dto.amount * exchangeRate).toFixed(8));
      
      // Log FX conversion if applicable
      if (auditContext && exchangeRate) {
        fxConversionId = `fx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await this.adminAuditService.logFinancialEvent(auditContext, {
          userId: auditContext.actorId,
          action: 'FX_CONVERSION',
          entityId: fxConversionId,
          entityType: 'FXConversion',
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          metadata: {
            fromCurrency: dto.currency.toUpperCase(),
            toCurrency: dto.targetCurrency.toUpperCase(),
            rate: exchangeRate,
            convertedAmount,
            pair,
          },
        });
      }
    }

    const transaction = await this.lifecycleService.create({
      amount: dto.amount,
      currency: dto.currency.toUpperCase(),
      description: dto.description,
      walletId: dto.walletId,
      toAddress: dto.toAddress,
      fromAddress: dto.fromAddress,
      externalId: dto.externalId,
      metadata: {
        ...dto.metadata,
        ...(exchangeRate !== undefined ? { exchangeRate, convertedAmount, targetCurrency: dto.targetCurrency, fxConversionId } : {}),
      },
    });

    // Log transaction creation
    if (auditContext) {
      await this.adminAuditService.logFinancialEvent(auditContext, {
        userId: auditContext.actorId,
        action: 'TRANSACTION_CREATED',
        entityId: transaction.id,
        entityType: 'Transaction',
        amount: dto.amount,
        currency: dto.currency.toUpperCase(),
        beforeSnapshot: { walletId: dto.walletId },
        afterSnapshot: {
          transactionId: transaction.id,
          amount: dto.amount,
          currency: dto.currency.toUpperCase(),
          status: transaction.status,
          ...(exchangeRate !== undefined ? { exchangeRate, convertedAmount, targetCurrency: dto.targetCurrency } : {}),
        },
        metadata: {
          walletId: dto.walletId,
          toAddress: dto.toAddress,
          fromAddress: dto.fromAddress,
          externalId: dto.externalId,
          ...(fxConversionId ? { fxConversionId } : {}),
        },
      });
    }

    // Transition to PROCESSING after creation
    setImmediate(() => {
      this.lifecycleService.markProcessing(transaction.id).catch(() => {});
    });

    // Risk scoring runs asynchronously - never blocks response
    setImmediate(() => {
      try {
        // Check if evaluateRisk method exists before calling
        if (this.riskScoringService && typeof (this.riskScoringService as any).evaluateRisk === 'function') {
          (this.riskScoringService as any).evaluateRisk(transaction.id).catch(() => {});
        }
      } catch (error) {
        // Risk scoring failure should not block transaction
        console.error('Risk scoring failed:', error);
      }
    });

    // Emit webhook after commit
    setImmediate(() => {
      this.webhookDispatcher.dispatch('transaction.created', {
        transactionId: transaction.id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
      }).catch(() => {});
    });

    return {
      success: true,
      data: {
        ...transaction,
        ...(exchangeRate !== undefined ? { exchangeRate, convertedAmount } : {}),
      },
    };
  }

  // ✅ NEW: FTS Search with wallet aliases
  async search(dto: SearchTransactionsDto, userId?: string) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.txRepo.createQueryBuilder('t');

    // ✅ Full-text search query (optional)
    if (dto.q && dto.q.trim().length > 0) {
      const q = dto.q.trim();

      // websearch_to_tsquery supports google-like syntax
      qb.andWhere(`t.search_vector @@ websearch_to_tsquery('simple', :q)`, {
        q,
      });

      // optionally include ranking
      qb.addSelect(
        `ts_rank(t.search_vector, websearch_to_tsquery('simple', :q))`,
        'rank',
      );
      qb.orderBy('rank', 'DESC');
    }

    // ✅ Filters
    if (dto.status) {
      qb.andWhere('t.status = :status', { status: dto.status });
    }

    if (dto.currency) {
      qb.andWhere('t.currency = :currency', { currency: dto.currency });
    }

    if (dto.from) {
      qb.andWhere('t.created_at >= :from', { from: new Date(dto.from) });
    }

    if (dto.to) {
      qb.andWhere('t.created_at <= :to', { to: new Date(dto.to) });
    }

    if (dto.categoryId) {
      qb.andWhere('t.categoryId = :categoryId', { categoryId: dto.categoryId });
    }

    // ✅ Sorting fallback (if no FTS ranking or if you want to force sort)
    if (!dto.q) {
      const sortCol = dto.sortBy === 'amount' ? 't.amount' : 't.created_at';

      qb.orderBy(
        sortCol,
        (dto.sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC',
      );
    }

    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();

    // ✅ Enrich with wallet aliases if userId is provided
    let enrichedItems = items;
    if (userId) {
      enrichedItems = await this.enrichWithWalletAliases(items, userId);
    }

    return {
      success: true,
      data: enrichedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async enrichWithWalletAliases(transactions: TransactionEntity[], userId: string) {
    const walletAliasMap = await this.walletAliasService.getWalletAliasMap(userId);
    
    return transactions.map(tx => {
      // Extract wallet addresses from transaction metadata/payload
      const walletAddresses = this.extractWalletAddresses(tx);
      const walletAliases: Record<string, string> = {};
      
      walletAddresses.forEach(address => {
        const alias = walletAliasMap.get(address);
        if (alias) {
          walletAliases[address] = alias;
        }
      });

      return {
        ...tx,
        walletAliases: Object.keys(walletAliases).length > 0 ? walletAliases : undefined,
      };
    });
  }

  private extractWalletAddresses(transaction: TransactionEntity): string[] {
    const addresses: string[] = [];
    
    // Extract from metadata
    if (transaction.metadata) {
      if (transaction.metadata.fromAddress) {
        addresses.push(transaction.metadata.fromAddress);
      }
      if (transaction.metadata.toAddress) {
        addresses.push(transaction.metadata.toAddress);
      }
      if (transaction.metadata.walletAddress) {
        addresses.push(transaction.metadata.walletAddress);
      }
    }

    // Extract from payload
    if (transaction.payload) {
      if (transaction.payload.fromAddress) {
        addresses.push(transaction.payload.fromAddress);
      }
      if (transaction.payload.toAddress) {
        addresses.push(transaction.payload.toAddress);
      }
      if (transaction.payload.walletAddress) {
        addresses.push(transaction.payload.walletAddress);
      }
    }

    // Remove duplicates
    return [...new Set(addresses)];
  }
}
