import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import Big from 'big.js';
import { SpendingCategoryEntity } from './entities/spending-category.entity';
import { SpendingEntryEntity } from './entities/spending-entry.entity';
import { CreateSpendingCategoryDto } from './dto/create-spending-category.dto';
import { CreateSpendingEntryDto } from './dto/create-spending-entry.dto';
import { QuerySpendingSummaryDto } from './dto/query-spending-summary.dto';

@Injectable()
export class SpendingService {
  constructor(
    @InjectRepository(SpendingCategoryEntity)
    private readonly categoryRepo: Repository<SpendingCategoryEntity>,
    @InjectRepository(SpendingEntryEntity)
    private readonly entryRepo: Repository<SpendingEntryEntity>,
  ) {}

  async createCategory(userId: string, dto: CreateSpendingCategoryDto): Promise<SpendingCategoryEntity> {
    const category = this.categoryRepo.create({ userId, ...dto });
    return this.categoryRepo.save(category);
  }

  async getCategories(userId: string): Promise<SpendingCategoryEntity[]> {
    return this.categoryRepo.find({ where: { userId }, order: { name: 'ASC' } });
  }

  async deleteCategory(userId: string, categoryId: string): Promise<void> {
    const category = await this.categoryRepo.findOne({ where: { id: categoryId, userId } });
    if (!category) throw new NotFoundException('Category not found');
    await this.categoryRepo.remove(category);
  }

  async createEntry(userId: string, dto: CreateSpendingEntryDto): Promise<SpendingEntryEntity> {
    if (dto.categoryId) {
      const category = await this.categoryRepo.findOne({
        where: { id: dto.categoryId, userId },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }

    // Note: no transaction repo is injected into this module, so we cannot
    // cheaply verify that dto.transactionId belongs to the caller without
    // adding heavier wiring. That check is left as a follow-up.
    const entry = this.entryRepo.create({
      userId,
      transactionId: dto.transactionId,
      categoryId: dto.categoryId,
      amount: dto.amount,
      description: dto.description,
      date: new Date(dto.date),
    });
    return this.entryRepo.save(entry);
  }

  async getEntries(userId: string, startDate?: Date, endDate?: Date): Promise<SpendingEntryEntity[]> {
    const where: any = { userId };
    if (startDate && endDate) {
      where.date = Between(startDate, endDate);
    } else if (startDate) {
      where.date = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.date = LessThanOrEqual(endDate);
    }
    return this.entryRepo.find({ where, order: { date: 'DESC' }, relations: ['category'] });
  }

  async getSummary(userId: string, query: QuerySpendingSummaryDto) {
    const { period = 'month', startDate: rawStart, endDate: rawEnd } = query;

    let start: Date;
    let end: Date;

    if (rawStart && rawEnd) {
      start = new Date(rawStart);
      end = new Date(rawEnd);
    } else {
      end = new Date();
      start = new Date();
      if (period === 'week') {
        start.setDate(start.getDate() - 7);
      } else if (period === 'month') {
        start.setMonth(start.getMonth() - 1);
      } else if (period === 'year') {
        start.setFullYear(start.getFullYear() - 1);
      }
    }

    const entries = await this.getEntries(userId, start, end);

    // Group by currency. SpendingEntryEntity has no currency column yet, so
    // every (old and current) row falls back to 'USD'. Follow-up: add a
    // currency column + migration (explicitly out of scope here).
    const byCurrency: Record<string, Big> = {};
    const byCategory: Record<string, { name: string; color: string; total: number; count: number }> = {};

    for (const entry of entries) {
      const amt = Number(entry.amount);
      const currency = (entry as { currency?: string }).currency || 'USD';
      byCurrency[currency] = (byCurrency[currency] ?? new Big(0)).plus(amt);

      const catId = entry.categoryId || 'uncategorized';
      if (!byCategory[catId]) {
        byCategory[catId] = {
          name: entry.category?.name || 'Uncategorized',
          color: entry.category?.color || '#6B7280',
          total: 0,
          count: 0,
        };
      }
      byCategory[catId].total += amt;
      byCategory[catId].count += 1;
    }

    const categoryBreakdown = Object.entries(byCategory)
      .map(([categoryId, data]) => ({ categoryId, ...data }))
      .sort((a, b) => b.total - a.total);

    const totals = Object.values(byCurrency);

    return {
      success: true,
      data: {
        period,
        startDate: start,
        endDate: end,
        // Preserve the legacy numeric field: single-currency total, or the
        // total of the first currency when multiple are present.
        totalSpent: Number((totals[0] ?? new Big(0)).toString()),
        byCurrency: Object.fromEntries(
          Object.entries(byCurrency).map(([c, t]) => [c, t.toString()]),
        ),
        transactionCount: entries.length,
        categoryBreakdown,
      },
    };
  }
}
