import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('retention_policies')
@Index('idx_retention_policies_entity_type', ['entityType'], { unique: true })
export class RetentionPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  entityType: string;

  /** Days to retain before archival (e.g. transactions = 2555 / ~7 years) */
  @Column({ type: 'int' })
  retentionDays: number;

  /** Days after archival before hard deletion */
  @Column({ type: 'int' })
  deletionDays: number;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'text', nullable: true })
  legalBasis?: string;

  @Column({ type: 'boolean', default: false })
  protectLinkedToRegReport: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export const DEFAULT_RETENTION_POLICIES: Array<
  Pick<RetentionPolicyEntity, 'entityType' | 'retentionDays' | 'deletionDays' | 'legalBasis' | 'protectLinkedToRegReport'>
> = [
  {
    entityType: 'transactions',
    retentionDays: 2555,
    deletionDays: 3650,
    legalBasis: 'Financial records — 7-year legal requirement',
    protectLinkedToRegReport: true,
  },
  {
    entityType: 'audit_logs',
    retentionDays: 1825,
    deletionDays: 2190,
    legalBasis: 'Audit trail — 5-year regulatory requirement',
    protectLinkedToRegReport: true,
  },
  {
    entityType: 'api_usage_logs',
    retentionDays: 365,
    deletionDays: 730,
    legalBasis: 'Operational logs — 1-year retention',
    protectLinkedToRegReport: false,
  },
];
