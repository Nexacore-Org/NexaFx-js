import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { CaseEvent } from './case-event.entity';

export enum CaseStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  IN_PROGRESS = 'IN_PROGRESS',
  ESCALATED = 'ESCALATED',
  CLOSED = 'CLOSED',
  RESOLVED = 'RESOLVED',
}

/** Backwards-compatible alias used by ComplianceCaseService and AmlAdminController */
export type ComplianceCaseStatus = CaseStatus;

@Entity('compliance_cases')
@Index('idx_compliance_cases_user_id', ['userId'])
@Index('idx_compliance_cases_rule_triggered', ['ruleTriggered'])
@Index('idx_compliance_cases_status', ['status'])
@Index('idx_compliance_cases_idempotency', ['userId', 'ruleTriggered', 'caseDate'], { unique: true })
export class ComplianceCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User flagged by the AML rule */
  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  /** The AML rule type that triggered this case */
  @Column({ type: 'varchar', length: 50, nullable: true })
  ruleTriggered?: string;

  /** Transaction IDs that constitute the AML evidence */
  @Column({ type: 'jsonb', default: [] })
  evidenceTransactionIds: string[];

  @Column({ type: 'enum', enum: CaseStatus, default: CaseStatus.OPEN })
  status: CaseStatus;

  /** Admin/analyst assigned to this case */
  @Column({ type: 'varchar', nullable: true })
  assignedTo?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'varchar', nullable: true })
  resolutionType?: string;

  @Column({ type: 'text', nullable: true })
  resolutionSummary?: string;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  /**
   * Date portion used for idempotency — one AML case per user per rule per calendar day.
   * Stored as 'YYYY-MM-DD'. Nullable for manually created cases.
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  caseDate?: string;

  @OneToMany(() => CaseEvent, (event: CaseEvent) => event.complianceCase, { cascade: true })
  events: CaseEvent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

/** Alias so that case-event.entity.ts import remains valid */
export { ComplianceCaseEntity as ComplianceCase };
