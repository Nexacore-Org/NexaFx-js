import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BulkPaymentEntity } from './bulk-payment.entity';

export type BulkPaymentItemStatus = 'pending' | 'success' | 'failed';

@Entity('bulk_payment_items')
@Index('idx_bulk_payment_items_bulk_payment_id', ['bulkPaymentId'])
@Index('idx_bulk_payment_items_status', ['status'])
export class BulkPaymentItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  bulkPaymentId: string;

  @ManyToOne(() => BulkPaymentEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bulkPaymentId' })
  bulkPayment?: BulkPaymentEntity;

  @Column({ type: 'varchar', length: 255 })
  recipientAddress: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: BulkPaymentItemStatus;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
