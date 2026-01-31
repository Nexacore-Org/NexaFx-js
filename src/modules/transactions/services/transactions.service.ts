import { TransactionExecutionSnapshotEntity } from '../entities/transaction-execution-snapshot.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';
import { EnrichmentService } from '../../enrichment/enrichment.service';
import { WalletAliasService } from './wallet-alias.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
    private readonly enrichmentService: EnrichmentService,
    private readonly walletAliasService: WalletAliasService,
  ) {}

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
