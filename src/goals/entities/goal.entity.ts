import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { GoalContribution } from './goal-contribution.entity';

export enum GoalStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

@Entity('goals')
export class Goal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  targetAmount: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: '0' })
  currentAmount: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'timestamp', nullable: true })
  deadline: Date;

  /**
   * @deprecated Use deadline field instead. This field is kept for backward compatibility.
   * Will be removed in a future migration.
   */
  @Column({ name: 'target_date', type: 'timestamp', nullable: true })
  targetDate?: Date;

  @Column({ type: 'enum', enum: GoalStatus, default: GoalStatus.ACTIVE })
  status: GoalStatus;

  @Column({ name: 'linked_wallet_id', type: 'uuid', nullable: true })
  linkedWalletId: string | null;

  // Round-up rule
  @Column({ name: 'round_up_enabled', default: false })
  roundUpEnabled: boolean;

  @Column({ name: 'round_up_unit', type: 'int', nullable: true })
  roundUpUnit: number | null;

  // Milestone bitmask: bit0=25%, bit1=50%, bit2=75%, bit3=100%
  @Column({ name: 'milestones_notified', type: 'int', default: 0 })
  milestonesNotified: number;

  @Column({ name: 'is_completed', default: false })
  isCompleted: boolean;

  @Column({ name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @OneToMany(() => GoalContribution, (c) => c.goal, { cascade: ['insert'] })
  contributions: GoalContribution[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get progressPercentage(): number {
    const target = parseFloat(this.targetAmount as any);
    if (!target) return 0;
    return Math.min((parseFloat(this.currentAmount as any) / target) * 100, 100);
  }

  /**
   * Check if goal is overdue (deadline passed and goal is still ACTIVE)
   * Uses the deadline field as the single source of truth for expiry calculations
   */
  get isOverdue(): boolean {
    if (!this.deadline) return false;
    return new Date() > new Date(this.deadline) && this.status === GoalStatus.ACTIVE;
  }
}
