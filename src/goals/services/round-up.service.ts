import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Goal } from '../entities/goal.entity';
import { GoalContribution, ContributionSource } from '../entities/goal-contribution.entity';
import { GOAL_EVENTS, RoundUpTriggeredPayload } from '../events/goal-events';

@Injectable()
export class RoundUpService {
  private readonly logger = new Logger(RoundUpService.name);

  constructor(
    @InjectRepository(Goal)
    private readonly goalRepo: Repository<Goal>,
    @InjectRepository(GoalContribution)
    private readonly contributionRepo: Repository<GoalContribution>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  triggerRoundUpAsync(payload: RoundUpTriggeredPayload): void {
    this.applyRoundUp(payload).catch((err) => {
      this.logger.error(
        `Round-up failed for goal ${payload.goalId} / tx ${payload.transactionId}: ${err?.message}`,
        err?.stack,
      );
    });
  }

  calculateDelta(transactionAmount: number, unit: number): number {
    const remainder = transactionAmount % unit;
    if (remainder === 0) return 0;
    return parseFloat((unit - remainder).toFixed(6));
  }

  private async applyRoundUp(payload: RoundUpTriggeredPayload): Promise<void> {
    const { goalId, transactionId, transactionAmount, roundUpUnit, linkedWalletId, currency } = payload;
    const delta = this.calculateDelta(transactionAmount, roundUpUnit);
    if (delta === 0) return;

    await this.dataSource.transaction(async (em) => {
      const goal = await em
        .createQueryBuilder(Goal, 'g')
        .setLock('pessimistic_write')
        .where('g.id = :id', { id: goalId })
        .getOne();

      if (!goal || goal.isCompleted || !goal.roundUpEnabled || goal.linkedWalletId !== linkedWalletId) return;
      
      // Skip round-up contributions for EXPIRED goals
      if (goal.status === 'expired') {
        this.logger.debug(`Skipping round-up for expired goal ${goalId}`);
        return;
      }

      const existing = await em.findOne(GoalContribution, { where: { goalId, transactionId } });
      if (existing) return;

      const newAmount = parseFloat(goal.currentAmount as any) + delta;
      const target = parseFloat(goal.targetAmount as any);
      const capped = Math.min(newAmount, target);
      const progress = (capped / target) * 100;

      goal.currentAmount = capped.toFixed(6) as any;
      goal.isCompleted = capped >= target;
      if (goal.isCompleted && !goal.completedAt) goal.completedAt = new Date();

      // Milestone notifications (idempotent via bitmask)
      const milestones = [25, 50, 75, 100];
      for (let i = 0; i < milestones.length; i++) {
        const bit = 1 << i;
        if (progress >= milestones[i] && !(goal.milestonesNotified & bit)) {
          goal.milestonesNotified |= bit;
          this.eventEmitter.emit(GOAL_EVENTS.MILESTONE_REACHED, {
            goalId,
            userId: goal.userId,
            milestone: milestones[i],
            currentAmount: goal.currentAmount,
            targetAmount: goal.targetAmount,
          });
        }
      }

      await em.save(Goal, goal);

      const contribution = em.create(GoalContribution, {
        goalId,
        amount: delta.toFixed(6),
        currency,
        source: ContributionSource.ROUND_UP,
        transactionId,
        progressSnapshot: progress.toFixed(2),
      });
      await em.save(GoalContribution, contribution);

      this.eventEmitter.emit(GOAL_EVENTS.ROUND_UP_TRIGGERED, {
        goalId,
        userId: goal.userId,
        progress,
        currentAmount: goal.currentAmount,
        targetAmount: goal.targetAmount,
        isCompleted: goal.isCompleted,
      });
    });
  }
}
