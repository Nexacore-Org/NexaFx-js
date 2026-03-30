import {
  Column, CreateDateColumn, Entity, Index,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

export type ScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'CANCELLED';

@Entity('scheduled_transactions')
@Index('idx_sched_tx_user', ['userId'])
@Index('idx_sched_tx_status_next', ['status', 'nextRunAt'])
export class ScheduledTransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 3, nullable: true })
  targetCurrency?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 20 })
  frequency: ScheduleFrequency;

  @Column({ type: 'varchar', length: 20, default: 'ACTIVE' })
  status: ScheduleStatus;

  @Column({ type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ type: 'int', default: 0 })
  consecutiveFailures: number;

  @Column({ type: 'int', default: 3 })
  maxConsecutiveFailures: number;

  @Column({ type: 'jsonb', nullable: true })
  executionHistory?: Array<{
    executedAt: string;
    status: 'SUCCESS' | 'FAILED';
    transactionId?: string;
    error?: string;
  }>;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
