import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type ScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type ScheduleStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

/** A persisted recurring transfer; the cron executor is tracked in issue #1392. */
@Entity('scheduled_transactions')
@Index('idx_scheduled_tx_due', ['status', 'nextRunAt'])
export class ScheduledTransaction {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid' }) recipientId: string;
  @Column({ type: 'decimal', precision: 20, scale: 8 }) amount: number;
  @Column({ type: 'varchar', length: 10 }) currency: string;
  @Column({ type: 'varchar', length: 10 }) frequency: ScheduleFrequency;
  @Column({ type: 'timestamp' }) nextRunAt: Date;
  @Column({ type: 'timestamp', nullable: true }) lastRunAt: Date | null;
  @Column({ type: 'varchar', length: 10, default: 'ACTIVE' }) status: ScheduleStatus;
  @Column({ type: 'int', default: 0 }) failureCount: number;
  @Column({ type: 'text', nullable: true }) lastError: string | null;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
