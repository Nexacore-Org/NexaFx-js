import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionCategory } from '../entities/transaction-category.entity';

export type CategoryConfidence = 'HIGH' | 'MEDIUM' | null;

@Injectable()
export class CategorizationEngineService {
  constructor(
    @InjectRepository(TransactionCategory)
    private readonly categoryRepo: Repository<TransactionCategory>,
  ) {}

  async categorize(input: {
    description?: string;
    merchant?: string;
    metadata?: Record<string, any>;
  }) {
    const categories = await this.categoryRepo.find();

    const text = `${input.description || ''} ${input.merchant || ''}`.toLowerCase();

    let bestMatch: {
      categoryId: string;
      confidence: CategoryConfidence;
      matchLength: number;
    } | null = null;

    for (const category of categories) {
      const keywords = category.keywords || [];
      const merchantTags = category.merchantTags || [];

      for (const keyword of keywords) {
        const kw = keyword.toLowerCase();

        if (text.includes(kw)) {
          const matchLength = kw.length;

          const confidence: CategoryConfidence =
            text === kw ? 'HIGH' : 'MEDIUM';

          if (
            !bestMatch ||
            matchLength > bestMatch.matchLength
          ) {
            bestMatch = {
              categoryId: category.id,
              confidence,
              matchLength,
            };
          }
        }
      }

      for (const tag of merchantTags) {
        const tg = tag.toLowerCase();

        if (text.includes(tg)) {
          const matchLength = tg.length;

          if (
            !bestMatch ||
            matchLength > bestMatch.matchLength
          ) {
            bestMatch = {
              categoryId: category.id,
              confidence: 'HIGH',
              matchLength,
            };
          }
        }
      }
    }

    if (!bestMatch) {
      return {
        categoryId: null,
        confidence: null,
      };
    }

    return {
      categoryId: bestMatch.categoryId,
      confidence: bestMatch.confidence,
    };
  }
}