import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum FreezeReason {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  SANCTIONS_HIT = 'sanctions_hit',
  AML_ALERT = 'aml_alert',
  COMPLIANCE_REVIEW = 'compliance_review',
  REGULATORY_REQUIREMENT = 'regulatory_requirement',
  FRAUD_PREVENTION = 'fraud_prevention',
  MANUAL_REVIEW = 'manual_review',
  OTHER = 'other',
}

export enum FreezeStatus {
  ACTIVE = 'active',
  LIFTED = 'lifted',
  EXPIRED = 'expired',
}

@Entity('user_freezes')
@Index(['userId'])
@Index(['status'])
@Index(['reason'])
export class UserFreeze {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'enum', enum: FreezeReason })
  reason: FreezeReason;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: FreezeStatus, default: FreezeStatus.ACTIVE })
  status: FreezeStatus;

  @Column({ nullable: true })
  frozenBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  frozenAt?: Date;

  @Column({ nullable: true })
  liftedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  liftedAt?: Date;

  @Column({ nullable: true })
  liftNotes?: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ default: false })
  isPermanent: boolean;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
