export const GOAL_EVENTS = {
  ROUND_UP_TRIGGERED: 'goal.roundup.triggered',
  MILESTONE_REACHED: 'goal.milestone.reached',
  GOAL_COMPLETED: 'goal.completed',
} as const;

export interface RoundUpTriggeredPayload {
  goalId: string;
  transactionId: string;
  transactionAmount: number;
  roundUpUnit: number;
  linkedWalletId: string;
  currency: string;
}

export interface MilestoneReachedPayload {
  goalId: string;
  userId: string;
  milestone: number;
  currentAmount: string;
  targetAmount: string;
}

export interface GoalCompletedPayload {
  goalId: string;
  userId: string;
  goalName: string;
  targetAmount: string;
}
