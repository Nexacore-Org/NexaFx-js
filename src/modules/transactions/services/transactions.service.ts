import { TransactionExecutionSnapshotEntity } from '../entities/transaction-execution-snapshot.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { SearchTransactionsDto } from '../dto/search-transactions.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  // ✅ NEW: FTS Search
  async search(dto: SearchTransactionsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const offset = (page - 1) * limit;

    const qb = this.txRepo.createQueryBuilder('t');

    const saved = await this.txRepo.save(tx);


    // ✅ Full-text search query (optional)
    if (dto.q && dto.q.trim().length > 0) {
      const q = dto.q.trim();

      // websearch_to_tsquery supports google-like syntax
      qb.andWhere(`t.search_vector @@ websearch_to_tsquery('simple', :q)`, { q });

      // optionally include ranking
      qb.addSelect(`ts_rank(t.search_vector, websearch_to_tsquery('simple', :q))`, 'rank');
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

    // ✅ Sorting fallback (if no FTS ranking or if you want to force sort)
    if (!dto.q) {
      const sortCol =
        dto.sortBy === 'amount' ? 't.amount' : 't.created_at';

      qb.orderBy(sortCol, (dto.sortOrder ?? 'desc').toUpperCase() as 'ASC' | 'DESC');
    }

    // ✅ async fire-and-forget enrichment
setImmediate(() => {
  this.enrichmentService.enrichTransaction(saved.id).catch(() => null);


    qb.take(limit).skip(offset);

    const [items, total] = await qb.getManyAndCount();

    return {
      success: true,
      data: items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

