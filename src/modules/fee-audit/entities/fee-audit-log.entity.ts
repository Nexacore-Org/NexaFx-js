import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type FeeType = 'percentage' | 'flat';

@Entity('fee_audit_logs')
@Index('idx_fee_audit_logs_user_id', ['userId'])
@Index('idx_fee_audit_logs_transaction_id', ['transactionId'])
export class FeeAuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId?: string;

  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  feeAmount: number;

  @Column({ type: 'varchar', length: 3 })
  feeCurrency: string;

  @Column({ type: 'varchar', length: 20 })
  feeType: FeeType;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  calculatedAmount?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  appliedTier?: string;

  @CreateDateColumn()
  createdAt: Date;
}
