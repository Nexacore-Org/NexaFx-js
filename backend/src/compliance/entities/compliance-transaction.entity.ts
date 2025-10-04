import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  BLOCKED = 'blocked',
  FLAGGED = 'flagged',
}

export enum TransactionDirection {
  INBOUND = 'inbound',
  OUTBOUND = 'outbound',
}

@Entity('compliance_transactions')
@Index(['userId', 'createdAt'])
@Index(['status'])
@Index(['riskScore'])
export class ComplianceTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column('uuid')
  transactionId: string; // External transaction ID

  @Column({ type: 'enum', enum: TransactionDirection })
  direction: TransactionDirection;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @Column({ nullable: true })
  recipientId?: string;

  @Column({ nullable: true })
  recipientAccount?: string;

  @Column({ nullable: true })
  recipientBank?: string;

  @Column({ type: 'enum', enum: TransactionStatus, default: TransactionStatus.PENDING })
  status: TransactionStatus;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  riskScore: number;

  @Column({ type: 'json', nullable: true })
  riskFactors?: Record<string, any>;

  @Column({ type: 'json', nullable: true })
  complianceChecks?: Record<string, any>;

  @Column({ nullable: true })
  blockedReason?: string;

  @Column({ nullable: true })
  flaggedReason?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @Column({ nullable: true })
  deviceFingerprint?: string;

  @Column({ nullable: true })
  geoLocation?: string;

  @Column({ nullable: true })
  velocityScore?: number;

  @Column({ default: false })
  isWhitelistedRecipient: boolean;

  @Column({ nullable: true })
  reviewId?: string; // If flagged for manual review

  @Column({ nullable: true })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @Column({ nullable: true })
  reviewNotes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
