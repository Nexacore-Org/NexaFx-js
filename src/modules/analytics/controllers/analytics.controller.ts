import { Controller, Get, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import {
  AnalyticsPeriod,
  TransactionAnalyticsService,
} from '../services/transaction-analytics.service';

@Controller('analytics/transactions')
export class AnalyticsController {
  constructor(private readonly analytics: TransactionAnalyticsService) {}

  @Get()
  getTransactions(@Req() req: Request, @Query() query: Record<string, string>) {
    return this.analytics.getAnalytics({
      userId: this.getUserId(req),
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  @Get('categories')
  getCategories(@Req() req: Request, @Query() query: Record<string, string>) {
    return this.analytics.getCategoryBreakdown({
      userId: this.getUserId(req),
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  @Get('currencies')
  getCurrencies(@Req() req: Request, @Query() query: Record<string, string>) {
    return this.analytics.getCurrencyBreakdown({
      userId: this.getUserId(req),
      period: this.getPeriod(query.period),
      startDate: this.getDate(query.startDate),
      endDate: this.getDate(query.endDate),
    });
  }

  private getUserId(req: Request): string | null {
    const user = (req as any).user;
    return user?.id ?? user?.sub ?? (req.headers['x-user-id'] as string) ?? null;
  }

  private getPeriod(value?: string): AnalyticsPeriod {
    return value === 'WEEKLY' || value === 'MONTHLY' ? value : 'DAILY';
  }

  private getDate(value?: string): Date | undefined {
    return value ? new Date(value) : undefined;
  }
}
