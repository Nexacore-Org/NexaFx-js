import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { TransactionEntity } from '../transactions/entities/transaction.entity';
import { EnrichmentProvider } from './providers/enrichment-provider.interface';
import { HeuristicEnrichmentProvider } from './providers/heuristic.provider';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);

  // ✅ pluggable providers list (add more later)
  private readonly providers: EnrichmentProvider[] = [
    new HeuristicEnrichmentProvider(),
  ];

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  async enrichTransaction(transactionId: string) {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) return;

    const results: any[] = [];

    for (const provider of this.providers) {
      try {
        const res = await provider.enrich(tx);
        if (res) results.push(res);
      } catch (e: any) {
        this.logger.warn(
          `Enrichment provider failed: ${provider.name} tx=${transactionId} err=${e?.message}`,
        );
      }
    }

    const metadata = {
      transactionId: tx.id,
      updatedAt: new Date().toISOString(),
      results,
      summary: {
        merchantHint: results.find((r) => r.merchantHint)?.merchantHint ?? null,
        categoryHint: results.find((r) => r.categoryHint)?.categoryHint ?? null,
      },
    };

    await this.txRepo.update(
      { id: tx.id },
      {
        enrichmentMetadata: metadata as any,
        enrichmentUpdatedAt: new Date(),
      },
    );

    return metadata;
  }

  async getEnrichment(transactionId: string) {
    const tx = await this.txRepo.findOne({
      where: { id: transactionId },
      select: ['id', 'enrichmentMetadata', 'enrichmentUpdatedAt'] as any,
    });

    if (!tx) return null;

    return {
      transactionId: tx.id,
      enrichmentMetadata: tx.enrichmentMetadata ?? null,
      enrichmentUpdatedAt: tx.enrichmentUpdatedAt ?? null,
    };
  }
}
