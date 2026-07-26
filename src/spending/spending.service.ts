import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
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

    let totalSpent = 0;
    const byCategory: Record<string, { name: string; color: string; total: number; count: number }> = {};

    for (const entry of entries) {
      const amt = Number(entry.amount);
      totalSpent += amt;

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

    return {
      success: true,
      data: {
        period,
        startDate: start,
        endDate: end,
        totalSpent: Math.round(totalSpent * 1e8) / 1e8,
        transactionCount: entries.length,
        categoryBreakdown,
      },
    };
  }
}
