import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ComplianceEventType {
  LIMIT_CHECK = 'limit_check',
  RISK_ASSESSMENT = 'risk_assessment',
  SANCTIONS_SCREENING = 'sanctions_screening',
  PEP_SCREENING = 'pep_screening',
  AML_SCREENING = 'aml_screening',
  VELOCITY_CHECK = 'velocity_check',
  ACCOUNT_FROZEN = 'account_frozen',
  ACCOUNT_UNFROZEN = 'account_unfrozen',
  TRANSACTION_FLAGGED = 'transaction_flagged',
  TRANSACTION_BLOCKED = 'transaction_blocked',
  SUSPICIOUS_ACTIVITY_REPORT = 'suspicious_activity_report',
  COMPLIANCE_REVIEW = 'compliance_review',
  LIMIT_OVERRIDE = 'limit_override',
  SANCTIONS_HIT = 'sanctions_hit',
  PEP_HIT = 'pep_hit',
  AML_ALERT = 'aml_alert',
  VELOCITY_ALERT = 'velocity_alert',
}

export enum ComplianceEventSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('compliance_events')
@Index(['userId', 'createdAt'])
@Index(['eventType'])
@Index(['severity'])
@Index(['createdAt'])
export class ComplianceEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ nullable: true })
  transactionId?: string;

  @Column({ type: 'enum', enum: ComplianceEventType })
  eventType: ComplianceEventType;

  @Column({ type: 'enum', enum: ComplianceEventSeverity, default: ComplianceEventSeverity.MEDIUM })
  severity: ComplianceEventSeverity;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ nullable: true })
  triggeredBy?: string; // User ID or system

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ nullable: true })
  userAgent?: string;

  @Column({ default: false })
  requiresAction: boolean;

  @Column({ default: false })
  isResolved: boolean;

  @Column({ nullable: true })
  resolvedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date;

  @Column({ nullable: true })
  resolutionNotes?: string;

  @CreateDateColumn()
  createdAt: Date;
}
