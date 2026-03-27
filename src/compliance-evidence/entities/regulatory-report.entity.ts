import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum ReportType {
  LTR = 'LTR', // Large Transaction Report
  SAR = 'SAR', // Suspicious Activity Report
  STR = 'STR', // Suspicious Transaction Report
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  FILED = 'FILED',
  REJECTED = 'REJECTED',
}

@Entity('regulatory_reports')
export class RegulatoryReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: ReportType })
  type: ReportType;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.DRAFT })
  status: ReportStatus;

  @Column({ type: 'jsonb' })
  data: Record<string, any>; // Regulatory specific fields

  @Index()
  @Column({ nullable: true })
  transactionId: string;

  @Column({ nullable: true })
  filedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}