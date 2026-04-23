import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { GOAL_EVENTS, MilestoneReachedPayload, GoalCompletedPayload } from '../events/goal-events';

@Injectable()
export class GoalProgressListener {
  private readonly logger = new Logger(GoalProgressListener.name);

  @OnEvent(GOAL_EVENTS.MILESTONE_REACHED)
  onMilestoneReached(payload: MilestoneReachedPayload): void {
    this.logger.log(
      `Goal ${payload.goalId} reached ${payload.milestone}% milestone for user ${payload.userId}`,
    );
    // TODO: inject NotificationsService and send push/email notification
  }

  @OnEvent(GOAL_EVENTS.GOAL_COMPLETED)
  onGoalCompleted(payload: GoalCompletedPayload): void {
    this.logger.log(`Goal "${payload.goalName}" completed for user ${payload.userId}`);
    // TODO: send congratulatory notification
  }
}
