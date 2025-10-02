import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum ReportStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum ReportFormat {
  CSV = 'csv',
  PDF = 'pdf',
  EXCEL = 'excel',
}

@Entity()
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDING })
  status: ReportStatus;
  
  @Column({ type: 'enum', enum: ReportFormat })
  format: ReportFormat;

  @Column({ nullable: true })
  fileUrl?: string; // e.g., a path to S3 or a local file

  @CreateDateColumn()
  createdAt: Date;
}