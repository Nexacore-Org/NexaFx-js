import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REVERSED = 'reversed',
  CANCELLED = 'cancelled',
}

@Entity('transactions')
// Index names match the migrations (InitialSchema + AddMissingCoreIndexes) so TypeORM's
// schema diff does not try to rename or recreate them (issue #1544).
@Index('IDX_transactions_senderId_createdAt', ['senderId', 'createdAt'])
@Index('IDX_transactions_status_createdAt', ['status', 'createdAt'])
@Index('IDX_transactions_currency_createdAt', ['currency', 'createdAt'])
@Index('IDX_transactions_senderId', ['senderId'])
@Index('IDX_transactions_receiverId', ['receiverId'])
@Index('IDX_transactions_createdAt', ['createdAt'])
@Index('IDX_transactions_txHash', ['txHash'])
@Index('IDX_transactions_senderId_status', ['senderId', 'status'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'senderId' })
  sender?: User;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'receiverId' })
  receiver?: User;

  @Column({ type: 'uuid' })
  senderId!: string;

  @Column({ type: 'uuid' })
  receiverId!: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount: number;

  @Column({ length: 10 })
  currency!: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  fee: number;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Index({ unique: true })
  @Column({ unique: true })
  reference!: string;

  /** Human-readable receipt number, e.g. NXF-2026-000123 */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true, unique: true })
  receiptNumber!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  reversedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  pendingTimeoutAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  reversedBy!: string | null;

  @Column({ type: 'text', nullable: true })
  reversalReason!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reversalTransactionId!: string | null;

  @Column({ type: 'int', default: 0 })
  retryCount!: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  txHash!: string | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'[]'" })
  retryHashes!: string[];

  @Column({ type: 'varchar', nullable: true })
  tag: string | null;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[] | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
