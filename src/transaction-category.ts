import { Injectable } from '@nestjs/common';

@Injectable()
export class TransactionCategoryService {
  private categories = {
    'salary': 'income',
    'investment': 'income',
    'groceries': 'expense',
    'utilities': 'expense',
    'trading': 'trading'
  };

  categorize(transactionName: string): string {
    return this.categories[transactionName] || 'other';
  }

  addCategory(name: string, category: string) {
    this.categories[name] = category;
  }

  getCategories() {
    return this.categories;
  }
}
