import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ComplianceCaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED' | 'ESCALATED';

@Entity('compliance_cases')
@Index('idx_compliance_cases_user_id', ['userId'])
@Index('idx_compliance_cases_rule_triggered', ['ruleTriggered'])
@Index('idx_compliance_cases_status', ['status'])
@Index('idx_compliance_cases_idempotency', ['userId', 'ruleTriggered', 'caseDate'], { unique: true })
export class ComplianceCaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** The AML rule type that triggered this case */
  @Column({ type: 'varchar', length: 50 })
  ruleTriggered: string;

  /** Array of transaction IDs that constitute the evidence */
  @Column({ type: 'jsonb', default: [] })
  evidenceTransactionIds: string[];

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: ComplianceCaseStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  /**
   * Date portion used for idempotency (one case per user per rule per calendar day).
   * Stored as a date string 'YYYY-MM-DD'.
   */
  @Column({ type: 'varchar', length: 10 })
  caseDate: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
