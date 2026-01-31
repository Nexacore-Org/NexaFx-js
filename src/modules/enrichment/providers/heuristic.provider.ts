import {
  EnrichmentProvider,
  EnrichmentResult,
} from './enrichment-provider.interface';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';

export class HeuristicEnrichmentProvider implements EnrichmentProvider {
  name = 'heuristic';

  async enrich(
    transaction: TransactionEntity,
  ): Promise<EnrichmentResult | null> {
    const desc = String((transaction as any).description ?? '').toLowerCase();

    let categoryHint: string | undefined;
    let merchantHint: string | undefined;

    if (desc.includes('uber') || desc.includes('bolt'))
      categoryHint = 'transport';
    if (desc.includes('jumi') || desc.includes('konga'))
      categoryHint = 'ecommerce';
    if (desc.includes('mtn') || desc.includes('airtime'))
      categoryHint = 'telecom';
    if (desc.includes('netflix') || desc.includes('spotify'))
      categoryHint = 'subscriptions';

    if (desc.includes('netflix')) merchantHint = 'Netflix';
    if (desc.includes('spotify')) merchantHint = 'Spotify';

    if (!merchantHint && !categoryHint) return null;

    return {
      provider: this.name,
      merchantHint,
      categoryHint,
      confidence: 0.6,
      extra: {
        matchedDescription: true,
      },
    };
  }
}
