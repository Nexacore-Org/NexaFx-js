import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BulkBatchMode {
  ATOMIC = 'atomic',
  BEST_EFFORT = 'best_effort',
}

export enum BulkBatchStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

@Entity('bulk_batches')
@Index(['userId', 'createdAt'])
export class BulkBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: BulkBatchMode })
  mode: BulkBatchMode;

  @Column({ type: 'enum', enum: BulkBatchStatus, default: BulkBatchStatus.PENDING })
  status: BulkBatchStatus;

  @Column({ type: 'int', default: 0 })
  totalItems: number;

  @Column({ type: 'int', default: 0 })
  successCount: number;

  @Column({ type: 'int', default: 0 })
  failureCount: number;

  /** Per-item results stored as JSONB */
  @Column({ type: 'jsonb', default: [] })
  results: Array<{ index: number; success: boolean; transactionId?: string; error?: string }>;

  /** For export jobs: download URL (expires 1 hour) */
  @Column({ type: 'varchar', length: 1000, nullable: true })
  downloadUrl: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  downloadUrlExpiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
