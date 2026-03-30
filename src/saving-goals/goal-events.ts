// src/goals/events/goal-events.ts

export const GOAL_EVENTS = {
  ROUND_UP_TRIGGERED: 'goal.roundup.triggered',
  MILESTONE_REACHED: 'goal.milestone.reached',
  GOAL_COMPLETED: 'goal.completed',
} as const;

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface RoundUpTriggeredPayload {
  goalId: string;
  transactionId: string;
  /** Raw transaction amount (before rounding) */
  transactionAmount: number;
  /** Round-up unit configured on this goal (1 | 5 | 10) */
  roundUpUnit: number;
  /** Wallet ID to debit the round-up from */
  linkedWalletId: string;
  currency: string;
}

export interface MilestoneReachedPayload {
  goalId: string;
  userId: string;
  /** 25 | 50 | 75 | 100 */
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
