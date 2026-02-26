// src/modules/analytics/categorization.service.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class CategorizationService {
  private categoryMap = {
    'starbucks': 'Food & Drink',
    'binance': 'Investment',
    'amazon': 'Shopping',
    // Logic can be replaced with an OpenAI call for "Uncategorized" items
  };

  async categorizeTransaction(description: string): Promise<string> {
    const desc = description.toLowerCase();
    for (const [key, value] of Object.entries(this.categoryMap)) {
      if (desc.includes(key)) return value;
    }
    return 'General';
  }

  async getMonthlySummary(userId: string, month: number) {
    // Aggregate transactions by category from DB
    // Return: { Food: 200, Investment: 1500, ... }
  }
}