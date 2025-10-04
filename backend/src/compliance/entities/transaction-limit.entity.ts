import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { KycTier } from '../../kyc/entities/kyc-submission.entity';

@Entity('transaction_limits')
export class TransactionLimit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: KycTier })
  kycTier: KycTier;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  dailyLimit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  weeklyLimit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  monthlyLimit: number;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  singleTransactionLimit: number;

  @Column({ type: 'int', default: 10 })
  maxDailyTransactions: number;

  @Column({ type: 'int', default: 50 })
  maxWeeklyTransactions: number;

  @Column({ type: 'int', default: 200 })
  maxMonthlyTransactions: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
