import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type RetryJobStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type RetryErrorCategory =
  | 'NETWORK_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_TEMPORARY_FAILURE'
  | 'INSUFFICIENT_FUNDS'
  | 'INVALID_RECIPIENT'
  | 'DUPLICATE_REQUEST'
  | 'UNKNOWN';

@Entity('retry_jobs')
export class RetryJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // e.g. "transfer.retry"
  @Index()
  @Column({ type: 'varchar', length: 100 })
  type: string;

  // transferId or transactionId
  @Index()
  @Column({ type: 'varchar', length: 100 })
  entityId: string;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Index()
  @Column({ type: 'timestamptz' })
  nextRunAt: Date;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: RetryJobStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  lastErrorCategory?: RetryErrorCategory;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
