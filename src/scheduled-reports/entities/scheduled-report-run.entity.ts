import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ScheduledReportRunStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('scheduled_report_runs')
@Index(['reportId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['status', 'createdAt'])
export class ScheduledReportRun {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  reportId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: ScheduledReportRunStatus })
  status: ScheduledReportRunStatus;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'timestamp' })
  periodEnd: Date;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  fileReference: string | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
