import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ReportType } from '../report-type.enum';

export type ReportScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

@Entity('compliance_report_schedules')
export class ReportScheduleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  frequency: ReportScheduleFrequency;

  @Column({ type: 'jsonb' })
  recipientEmails: string[];

  @Column({ type: 'enum', enum: ReportType })
  reportType: ReportType;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  lastRunAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  nextRunAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
