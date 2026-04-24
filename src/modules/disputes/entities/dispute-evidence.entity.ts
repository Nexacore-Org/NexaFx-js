import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type EvidenceSubmitterRole = 'SENDER' | 'BENEFICIARY' | 'ADMIN';

@Entity('dispute_evidence')
@Index('idx_dispute_evidence_dispute_id', ['disputeId'])
@Index('idx_dispute_evidence_submitter', ['submittedBy'])
export class DisputeEvidenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  disputeId: string;

  @Column({ type: 'uuid' })
  submittedBy: string;

  @Column({ type: 'varchar', length: 50 })
  submitterRole: EvidenceSubmitterRole;

  /** File reference key (e.g. S3 key) — no binary content stored */
  @Column({ type: 'varchar', length: 500, nullable: true })
  fileReference?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fileName?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mimeType?: string;

  @Column({ type: 'text' })
  description: string;

  /** Extra metadata (file size, checksum, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn()
  submittedAt: Date;
}
