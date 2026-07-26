import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DisputeStatus = 'open' | 'under_review' | 'escalated' | 'resolved' | 'rejected';

@Entity('disputes')
@Index('idx_disputes_user_id', ['userId'])
@Index('idx_disputes_status', ['status'])
@Index('idx_disputes_transaction_id', ['transactionId'])
@Index('idx_disputes_created_at', ['createdAt'])
export class DisputeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'varchar', length: 255 })
  reason: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', length: 20, default: 'open' })
  status: DisputeStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedTo?: string;

  @Column({ type: 'int', default: 1 })
  escalationLevel: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date;
}
