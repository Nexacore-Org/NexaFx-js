import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type ReconciliationStatus = 'OPEN' | 'AUTO_RESOLVED' | 'ESCALATED';
export type MismatchType =
  | 'PROVIDER_MISMATCH'
  | 'BLOCKCHAIN_MISMATCH'
  | 'BOTH_MISMATCH';

@Entity('reconciliation_issues')
@Index('idx_recon_status', ['status'])
@Index('idx_recon_transaction', ['transactionId'])
export class ReconciliationIssueEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'varchar', length: 50 })
  mismatchType: MismatchType;

  @Column({ type: 'varchar', length: 50 })
  internalStatus: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  providerStatus?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  blockchainStatus?: string;

  @Column({ type: 'varchar', length: 50, default: 'OPEN' })
  status: ReconciliationStatus;

  @Column({ type: 'text', nullable: true })
  resolution?: string;

  @Column({ type: 'jsonb', nullable: true })
  rawSnapshot?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
