import { Injectable } from '@nestjs/common';

export interface EnrichmentInput {
  description?: string | null;
  currency: string;
  amount: number | string;
  fee?: number | string | null;
}

const CATEGORY_HINTS: Record<string, string[]> = {
  food: ['restaurant', 'cafe', 'grocery', 'food'],
  transport: ['uber', 'bolt', 'fuel', 'transport'],
  utilities: ['electric', 'water', 'internet', 'airtime', 'data'],
};

/** Deterministic, no-network enrichment of a transaction (issue #1387). */
@Injectable()
export class EnrichmentService {
  enrich(tx: EnrichmentInput) {
    const text = (tx.description ?? '').toLowerCase();
    const categoryHint =
      Object.keys(CATEGORY_HINTS).find((k) => CATEGORY_HINTS[k].some((w) => text.includes(w))) ?? 'other';
    const amount = Number(tx.amount);
    const feeShare = amount > 0 ? Number(tx.fee ?? 0) / amount : 0;
    return { categoryHint, currency: tx.currency, feeShare };
  }
}
