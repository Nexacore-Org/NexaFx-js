import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type BulkPaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'partial';

@Entity('bulk_payments')
@Index('idx_bulk_payments_user_id', ['userId'])
@Index('idx_bulk_payments_status', ['status'])
@Index('idx_bulk_payments_created_at', ['createdAt'])
export class BulkPaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BulkPaymentStatus;

  @Column({ type: 'int' })
  totalCount: number;

  @Column({ type: 'int', default: 0 })
  successCount: number;

  @Column({ type: 'int', default: 0 })
  failCount: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  totalAmount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;
}
