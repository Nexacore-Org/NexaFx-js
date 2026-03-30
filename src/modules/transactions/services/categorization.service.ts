import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionCategoryEntity } from '../entities/transaction-category.entity';
import { TransactionEntity } from '../entities/transaction.entity';

@Injectable()
export class CategorizationService {
  private readonly logger = new Logger(CategorizationService.name);

  constructor(
    @InjectRepository(TransactionCategoryEntity)
    private readonly categoryRepo: Repository<TransactionCategoryEntity>,
    @InjectRepository(TransactionEntity)
    private readonly txRepo: Repository<TransactionEntity>,
  ) {}

  /**
   * Auto-categorize a transaction asynchronously (fire-and-forget post-commit).
   * Does NOT block transaction creation.
   */
  triggerAutoCategorizationAsync(transactionId: string): void {
    setImmediate(() => this.autoCategorizeSafe(transactionId));
  }

  private async autoCategorizeSafe(transactionId: string): Promise<void> {
    try {
      await this.autoCategorize(transactionId);
    } catch (err) {
      this.logger.error(`Auto-categorization failed for tx ${transactionId}: ${err?.message}`);
    }
  }

  async autoCategorize(transactionId: string): Promise<void> {
    const tx = await this.txRepo.findOne({ where: { id: transactionId } });
    if (!tx) return;

    // Skip if manually overridden
    if (tx.categoryOverriddenAt) return;

    const categories = await this.categoryRepo.find();
    const result = this.matchBestCategory(tx, categories);
    if (!result) return;

    await this.txRepo.update(transactionId, {
      categoryId: result.category.id,
      categoryConfidence: result.confidence,
    });
  }

  /**
   * Allow user to manually override the auto-assigned category.
   * Persists override flag so future auto-categorization skips this tx.
   */
  async overrideCategory(transactionId: string, categoryId: string): Promise<void> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId } });
    if (!category) throw new Error('Category not found');

    await this.txRepo.update(transactionId, {
      categoryId,
      categoryConfidence: 1.0,
      categoryOverriddenAt: new Date(),
    });
  }

  /**
   * Admin: re-categorize all transactions in bulk (skips manually overridden ones).
   */
  async bulkRecategorize(): Promise<{ processed: number }> {
    const transactions = await this.txRepo.find({
      where: { categoryOverriddenAt: undefined },
    });

    let processed = 0;
    for (const tx of transactions) {
      if (tx.categoryOverriddenAt) continue;
      await this.autoCategorizeSafe(tx.id);
      processed++;
    }
    return { processed };
  }

  private matchBestCategory(
    tx: TransactionEntity,
    categories: TransactionCategoryEntity[],
  ): { category: TransactionCategoryEntity; confidence: number } | null {
    const text = [tx.description ?? '', JSON.stringify(tx.metadata ?? {})].join(' ').toLowerCase();

    let bestMatch: TransactionCategoryEntity | null = null;
    let bestScore = 0;

    for (const cat of categories) {
      const keywords: string[] = cat.keywords ?? [];
      const merchantTags: string[] = cat.merchantTags ?? [];
      const allTerms = [...keywords, ...merchantTags];

      // Longest-match wins: sort descending by length
      const sorted = allTerms.sort((a, b) => b.length - a.length);

      let score = 0;
      for (const term of sorted) {
        if (text.includes(term.toLowerCase())) {
          score = term.length; // longer match = higher confidence
          break;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = cat;
      }
    }

    if (!bestMatch || bestScore === 0) return null;

    // Normalize confidence: longer keyword = higher confidence, cap at 1.0
    const confidence = Math.min(bestScore / 20, 1.0);
    return { category: bestMatch, confidence };
  }
}
