import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum SARStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  FILED = 'filed',
}

@Entity('suspicious_activity_reports')
@Index(['userId'])
@Index(['status'])
@Index(['createdAt'])
export class SuspiciousActivityReport {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'json' })
  suspiciousActivities: Array<{
    transactionId?: string;
    activityType: string;
    amount?: number;
    timestamp: Date;
    description: string;
    riskFactors: Record<string, any>;
  }>;

  @Column({ type: 'enum', enum: SARStatus, default: SARStatus.DRAFT })
  status: SARStatus;

  @Column({ nullable: true })
  submittedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  submittedAt?: Date;

  @Column({ nullable: true })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @Column({ nullable: true })
  reviewNotes?: string;

  @Column({ nullable: true })
  filedTo?: string; // Regulatory authority

  @Column({ type: 'timestamp', nullable: true })
  filedAt?: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referenceNumber?: string;

  @Column({ type: 'json', nullable: true })
  attachments?: Array<{
    filename: string;
    url: string;
    uploadedAt: Date;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
