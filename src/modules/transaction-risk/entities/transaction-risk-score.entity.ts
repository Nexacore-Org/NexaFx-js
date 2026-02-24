import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RiskLevel } from '../interfaces/risk-check.interface';

@Entity('transaction_risk_scores')
@Index('idx_tx_risk_transaction_id', ['transactionId'], { unique: true })
@Index('idx_tx_risk_user_id', ['userId'])
@Index('idx_tx_risk_level', ['level'])
@Index('idx_tx_risk_flagged', ['flagged'])
export class TransactionRiskScoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId?: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  score: number;

  @Column({
    type: 'enum',
    enum: RiskLevel,
    default: RiskLevel.LOW,
  })
  level: RiskLevel;

  @Column({ type: 'boolean', default: false })
  flagged: boolean;

  @Column({ type: 'jsonb', default: [] })
  triggeredChecks: {
    checkName: string;
    score: number;
    reason: string;
  }[];

  // Admin override fields
  @Column({ type: 'boolean', default: false })
  overridden: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  overriddenBy?: string;

  @Column({ type: 'text', nullable: true })
  overrideReason?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  overrideLevel?: string;

  @Column({ type: 'timestamptz', nullable: true })
  overriddenAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
