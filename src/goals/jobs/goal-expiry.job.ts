import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Goal, GoalStatus } from '../entities/goal.entity';
import { NotificationService } from '../../../modules/notifications/services/notification.service';

/**
 * Daily cron job that expires all ACTIVE goals with deadline in the past
 * and sends notifications to goal owners.
 * 
 * This job is idempotent - re-running does not re-notify or re-expire already expired goals.
 * Only ACTIVE goals are eligible for expiry - COMPLETED goals are ignored.
 */
@Injectable()
export class GoalExpiryJob {
  private readonly logger = new Logger(GoalExpiryJob.name);

  constructor(
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Runs daily at midnight (00:00) to expire overdue goals
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleGoalExpiry(): Promise<void> {
    this.logger.log('Starting daily goal expiry job...');
    
    const now = new Date();
    
    // Find all ACTIVE goals with deadline in the past
    const goalsToExpire = await this.goalRepository.find({
      where: {
        status: GoalStatus.ACTIVE,
        deadline: LessThan(now),
      },
    });

    if (goalsToExpire.length === 0) {
      this.logger.log('No goals to expire');
      return;
    }

    this.logger.log(`Found ${goalsToExpire.length} goals to expire`);

    // Process goals in batches to avoid memory issues
    const batchSize = 100;
    for (let i = 0; i < goalsToExpire.length; i += batchSize) {
      const batch = goalsToExpire.slice(i, i + batchSize);
      await this.processBatch(batch);
    }

    this.logger.log(`Goal expiry job completed. Processed ${goalsToExpire.length} goals.`);
  }

  /**
   * Process a batch of goals for expiry
   */
  private async processBatch(goals: Goal[]): Promise<void> {
    const expiredGoals: Goal[] = [];

    for (const goal of goals) {
      // Double-check that goal is still ACTIVE (might have been changed by another process)
      if (goal.status !== GoalStatus.ACTIVE) {
        continue;
      }

      // Update goal status to EXPIRED
      goal.status = GoalStatus.EXPIRED;
      expiredGoals.push(goal);
    }

    if (expiredGoals.length === 0) {
      return;
    }

    // Save all expired goals in a single transaction
    await this.goalRepository.save(expiredGoals);

    // Send notifications for each expired goal
    const notificationPromises = expiredGoals.map(goal => 
      this.sendExpiryNotification(goal)
    );

    await Promise.allSettled(notificationPromises);
  }

  /**
   * Send expiry notification to goal owner
   */
  private async sendExpiryNotification(goal: Goal): Promise<void> {
    try {
      await this.notificationService.send({
        type: 'GOAL_EXPIRED',
        userId: goal.userId,
        payload: {
          goalId: goal.id,
          goalTitle: goal.title,
          targetAmount: goal.targetAmount,
          currentAmount: goal.currentAmount,
          currency: goal.currency,
          deadline: goal.deadline,
          progressPercentage: goal.progressPercentage,
        },
      });

      this.logger.debug(`Sent expiry notification for goal ${goal.id} to user ${goal.userId}`);
    } catch (error) {
      this.logger.error(
        `Failed to send expiry notification for goal ${goal.id}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Manual trigger for testing or emergency processing
   */
  async triggerManual(): Promise<{ processed: number }> {
    this.logger.log('Manual trigger of goal expiry job');
    await this.handleGoalExpiry();
    
    const expiredCount = await this.goalRepository.count({
      where: {
        status: GoalStatus.EXPIRED,
      },
    });

    return { processed: expiredCount };
  }
}
