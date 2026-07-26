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
}

@Entity('transactions')
@Index(['senderId', 'createdAt'])
@Index(['status', 'createdAt'])
@Index(['currency', 'createdAt'])
@Index(['senderId'])
@Index(['receiverId'])
@Index(['createdAt'])
@Index(['txHash'])
@Index(['senderId', 'status'])
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

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
