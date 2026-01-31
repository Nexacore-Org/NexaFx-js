import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoalStatus } from '../entities/goal.entity';

export class GoalResponseDto {
  @ApiProperty({ description: 'Goal ID' })
  id: string;

  @ApiProperty({ description: 'User ID' })
  userId: string;

  @ApiProperty({ description: 'Goal title' })
  title: string;

  @ApiPropertyOptional({ description: 'Goal description' })
  description?: string;

  @ApiProperty({ description: 'Target amount' })
  targetAmount: number;

  @ApiProperty({ description: 'Current saved amount' })
  currentAmount: number;

  @ApiProperty({ description: 'Currency code' })
  currency: string;

  @ApiPropertyOptional({ description: 'Deadline date' })
  deadline?: Date;

  @ApiProperty({ description: 'Goal status', enum: GoalStatus })
  status: GoalStatus;

  @ApiPropertyOptional({ description: 'Linked wallet ID' })
  linkedWalletId?: string;

  @ApiProperty({ description: 'Progress percentage (0-100)' })
  progressPercentage: number;

  @ApiProperty({ description: 'Whether goal is overdue' })
  isOverdue: boolean;

  @ApiProperty({ description: 'Remaining amount to reach goal' })
  remainingAmount: number;

  @ApiProperty({ description: 'Days until deadline (null if no deadline)' })
  daysUntilDeadline: number | null;

  @ApiProperty({ description: 'Creation date' })
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  updatedAt: Date;

  constructor(goal: any) {
    this.id = goal.id;
    this.userId = goal.userId;
    this.title = goal.title;
    this.description = goal.description;
    this.targetAmount = Number(goal.targetAmount);
    this.currentAmount = Number(goal.currentAmount);
    this.currency = goal.currency;
    this.deadline = goal.deadline;
    this.status = goal.status;
    this.linkedWalletId = goal.linkedWalletId;
    this.progressPercentage = goal.progressPercentage;
    this.isOverdue = goal.isOverdue;
    this.remainingAmount = Math.max(0, this.targetAmount - this.currentAmount);
    this.daysUntilDeadline = this.calculateDaysUntilDeadline(goal.deadline);
    this.createdAt = goal.createdAt;
    this.updatedAt = goal.updatedAt;
  }

  private calculateDaysUntilDeadline(deadline: Date | null): number | null {
    if (!deadline) return null;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffTime = deadlineDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }
}

export class GoalListResponseDto {
  @ApiProperty({ type: [GoalResponseDto] })
  goals: GoalResponseDto[];

  @ApiProperty({ description: 'Total number of goals' })
  total: number;

  @ApiProperty({ description: 'Summary statistics' })
  summary: {
    active: number;
    completed: number;
    totalTargetAmount: number;
    totalCurrentAmount: number;
    averageProgress: number;
  };
}