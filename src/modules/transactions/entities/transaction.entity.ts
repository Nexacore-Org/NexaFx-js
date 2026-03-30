import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Generated,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransactionCategoryEntity } from './transaction-category.entity';

@Entity('transactions')
@Index('idx_transactions_status', ['status'])
@Index('idx_transactions_created_at', ['createdAt'])
@Index('idx_transactions_search_vector', ['searchVector'], { fulltext: true })
@Index('idx_transactions_wallet_id', ['walletId'])
@Index('idx_transactions_wallet_created_at', ['walletId', 'createdAt'])
@Index('idx_transactions_to_address', ['toAddress'])
@Index('idx_transactions_from_address', ['fromAddress'])
@Index('idx_transactions_amount', ['amount'])
export class TransactionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  externalId?: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 50 })
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  payload?: Record<string, any>;

  @Column({ type: 'varchar', length: 120, nullable: true })
  walletId?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  toAddress?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fromAddress?: string;

  @Column({ type: 'jsonb', nullable: true })
  enrichmentMetadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  enrichmentUpdatedAt?: Date | null;

  @Column({ type: 'tsvector', nullable: true })
  searchVector?: any;

  @Column({ type: 'uuid', nullable: true })
  categoryId?: string;

  @ManyToOne(() => TransactionCategoryEntity, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category?: TransactionCategoryEntity;

  @Column({ type: 'float', nullable: true })
  categoryConfidence?: number;

  @Column({ type: 'timestamp', nullable: true })
  categoryOverriddenAt?: Date;

  @Column({ type: 'int', default: 0 })
  riskScore: number;

  @Column({ type: 'boolean', default: false })
  isFlagged: boolean;

  @Column({ type: 'timestamp', nullable: true })
  riskEvaluatedAt?: Date;

  @Column({ type: 'boolean', default: false })
  requiresManualReview: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
