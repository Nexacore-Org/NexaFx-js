import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ReportType, ExportFormat, ReportStatus } from '../enums/report-type.enum';

@Entity('compliance_reports')
@Index(['reportType', 'createdAt'])
@Index(['status'])
export class ComplianceReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ReportType })
  reportType: ReportType;

  @Column({ type: 'enum', enum: ExportFormat })
  exportFormat: ExportFormat;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDING })
  status: ReportStatus;

  @Column({ type: 'uuid' })
  requestedBy: string;

  @Column({ type: 'jsonb', nullable: true })
  filters: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  reportData: Record<string, unknown> | null;

  @Column({ nullable: true })
  exportPath: string | null;

  /** SHA-256 hex digest of the serialized reportData for tamper detection */
  @Column({ nullable: true })
  checksum: string | null;

  @Column({ type: 'int', nullable: true })
  recordCount: number | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
