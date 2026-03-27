import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { TransactionEntity } from '../../transactions/entities/transaction.entity';
import { Goal, GoalStatus } from '../../../goals/entities/goal.entity';
import { CashflowService } from './cashflow.service';
import { NotificationCenterService } from '../../notifications/services/notification-center.service';

export interface BalanceForecastPoint {
  date: string;
  projectedBalance: number;
  confidenceLow: number;
  confidenceHigh: number;
}

export interface WalletForecast {
  walletId: string;
  currentBalance: number;
  currency: string;
  forecast: {
    days30: BalanceForecastPoint[];
    days60: BalanceForecastPoint[];
    days90: BalanceForecastPoint[];
  };
  cashflowWarning: boolean;
  label: string;
}

export interface GoalForecast {
  goalId: string;
  title: string;
  targetAmount: number;
  currentAmount: number;
  currency: string;
  progressPercentage: number;
  estimatedCompletionDate: string | null;
  remainingAmount: number;
  avgMonthlyContribution: number;
  monthsRemaining: number | null;
  onTrack: boolean;
  label: string;
}

@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);

  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(Goal)
    private readonly goalRepo: Repository<Goal>,
    private readonly cashflowService: CashflowService,
    private readonly notificationCenterService: NotificationCenterService,
  ) {}

  async forecastWalletBalance(
    walletId: string,
    userId: string,
    currentBalance: number,
    currency: string,
  ): Promise<WalletForecast> {
    const trend = await this.cashflowService.getAverageSpendingTrend(walletId);
    const upcoming = await this.cashflowService.getUpcomingTransactions(walletId);

    const netDailyChange = trend.avgDailyInflow - trend.avgDailyOutflow;
    const dailyVariance = Math.abs(netDailyChange) * 0.2; // ±20% confidence range

    const projectBalance = (days: number): BalanceForecastPoint[] => {
      const points: BalanceForecastPoint[] = [];
      const now = new Date();

      for (let d = 1; d <= days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);

        // Add upcoming transactions scheduled on this date
        const dayUpcoming = upcoming.filter((u) => {
          const diff = Math.abs(u.estimatedDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24);
          return diff < 1;
        });

        const upcomingAmount = dayUpcoming.reduce((sum, u) => sum + u.amount, 0);

        const projected = currentBalance + netDailyChange * d + upcomingAmount;
        const low = projected - dailyVariance * Math.sqrt(d);
        const high = projected + dailyVariance * Math.sqrt(d);

        points.push({
          date: date.toISOString().split('T')[0],
          projectedBalance: Math.round(projected * 100) / 100,
          confidenceLow: Math.round(low * 100) / 100,
          confidenceHigh: Math.round(high * 100) / 100,
        });
      }

      return points;
    };

    const days30 = projectBalance(30);
    const days60 = projectBalance(60);
    const days90 = projectBalance(90);

    // Check if any projected balance goes negative within 30 days
    const cashflowWarning = days30.some((p) => p.confidenceLow < 0);

    if (cashflowWarning) {
      // Fire-and-forget notification
      this.notificationCenterService
        .send({
          userId,
          type: 'cashflow.warning',
          title: 'Cashflow Warning',
          body: 'Your projected balance may go negative within the next 30 days.',
          data: { walletId, currency },
        })
        .catch((err) => this.logger.error(`Failed to send cashflow warning: ${err?.message}`));
    }

    return {
      walletId,
      currentBalance,
      currency,
      forecast: { days30, days60, days90 },
      cashflowWarning,
      label: 'Projected balances are estimates based on historical spending patterns and scheduled transactions. Actual results may vary.',
    };
  }

  async forecastGoal(goalId: string): Promise<GoalForecast> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId } });
    if (!goal) {
      throw new NotFoundException(`Goal ${goalId} not found`);
    }

    const remaining = Number(goal.targetAmount) - Number(goal.currentAmount);
    const progress =
      goal.targetAmount > 0
        ? (Number(goal.currentAmount) / Number(goal.targetAmount)) * 100
        : 0;

    // Compute average monthly contribution from the last 90 days
    const now = new Date();
    const lookbackStart = new Date(now);
    lookbackStart.setDate(lookbackStart.getDate() - 90);

    const contributions = await this.transactionRepo.find({
      where: {
        walletId: goal.linkedWalletId ?? undefined,
        status: 'SUCCESS',
        createdAt: Between(lookbackStart, now) as any,
      },
    });

    const totalContributed = contributions.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const avgMonthly = totalContributed / 3; // 90 days ≈ 3 months

    let estimatedCompletionDate: string | null = null;
    let monthsRemaining: number | null = null;

    if (avgMonthly > 0 && remaining > 0) {
      monthsRemaining = Math.ceil(remaining / avgMonthly);
      const completionDate = new Date(now);
      completionDate.setMonth(completionDate.getMonth() + monthsRemaining);
      estimatedCompletionDate = completionDate.toISOString().split('T')[0];
    } else if (remaining <= 0) {
      estimatedCompletionDate = new Date().toISOString().split('T')[0];
      monthsRemaining = 0;
    }

    const onTrack =
      goal.deadline != null && estimatedCompletionDate != null
        ? new Date(estimatedCompletionDate) <= new Date(goal.deadline)
        : true;

    return {
      goalId: goal.id,
      title: goal.title,
      targetAmount: Number(goal.targetAmount),
      currentAmount: Number(goal.currentAmount),
      currency: goal.currency,
      progressPercentage: Math.round(progress * 100) / 100,
      estimatedCompletionDate,
      remainingAmount: Math.max(0, remaining),
      avgMonthlyContribution: Math.round(avgMonthly * 100) / 100,
      monthsRemaining,
      onTrack,
      label: 'Estimated completion date is based on current contribution pace and may change.',
    };
  }
}
