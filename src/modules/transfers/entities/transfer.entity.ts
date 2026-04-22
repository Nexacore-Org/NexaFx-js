import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type TransferStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

@Entity('transfers')
@Index('idx_transfers_sender', ['senderId'])
@Index('idx_transfers_recipient', ['recipientId'])
@Index('idx_transfers_status', ['status'])
@Index('idx_transfers_created', ['createdAt'])
@Index('idx_transfers_reversible_until', ['reversibleUntil'])
export class TransferEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  senderId: string;

  @Column({ type: 'uuid' })
  recipientId: string;

  @Column({ type: 'uuid' })
  senderWalletId: string;

  @Column({ type: 'uuid' })
  recipientWalletId: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: TransferStatus;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  fee: number;

  @Column({ type: 'uuid', nullable: true })
  senderTransactionId?: string;

  @Column({ type: 'uuid', nullable: true })
  recipientTransactionId?: string;

  @Column({ type: 'timestamptz' })
  reversibleUntil: Date;

  @Column({ type: 'text', nullable: true })
  reversalReason?: string;

  @Column({ type: 'uuid', nullable: true })
  reversedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  reversedAt?: Date;

  @Column({ type: 'text', nullable: true })
  failureReason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;
}
