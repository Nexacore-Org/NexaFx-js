import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ReportType {
  TRANSACTION_SUMMARY = 'transaction_summary',
  FEE_SUMMARY = 'fee_summary',
  PORTFOLIO = 'portfolio',
}

export enum ReportFrequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('scheduled_reports')
@Index(['userId', 'isActive'])
@Index(['nextRunAt'])
export class ScheduledReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ReportType })
  reportType: ReportType;

  @Column({ type: 'enum', enum: ReportFrequency })
  frequency: ReportFrequency;

  @Column({ type: 'timestamp' })
  nextRunAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
