import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Goal } from './goal.entity';

export enum ContributionSource {
  MANUAL = 'manual',
  ROUND_UP = 'round_up',
}

@Entity('goal_contributions')
@Index(['goalId', 'createdAt'])
@Index(['goalId', 'transactionId'], { unique: true, where: '"transaction_id" IS NOT NULL' })
export class GoalContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'goal_id' })
  goalId: string;

  @ManyToOne(() => Goal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goal_id' })
  goal: Goal;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  amount: string;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: ContributionSource, default: ContributionSource.MANUAL })
  source: ContributionSource;

  @Column({ name: 'transaction_id', nullable: true, type: 'uuid' })
  transactionId: string | null;

  @Column({ name: 'progress_snapshot', type: 'decimal', precision: 5, scale: 2 })
  progressSnapshot: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
