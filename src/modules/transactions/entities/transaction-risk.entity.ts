import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { TransactionEntity } from './transaction.entity';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface RiskFactor {
  rule: string;
  score: number;
  description: string;
  metadata?: Record<string, any>;
}

export interface RiskEvaluationLog {
  evaluatedAt: Date;
  previousScore?: number;
  newScore: number;
  factors: RiskFactor[];
  triggeredRules: string[];
  evaluatedBy?: string;
}

@Entity('transaction_risks')
@Index('idx_transaction_risks_score', ['riskScore'])
@Index('idx_transaction_risks_flagged', ['isFlagged'])
@Index('idx_transaction_risks_level', ['riskLevel'])
export class TransactionRiskEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  transactionId: string;

  @OneToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction?: TransactionEntity;

  @Column({ type: 'int', default: 0 })
  riskScore: number;

  @Column({ type: 'varchar', length: 20, default: 'LOW' })
  riskLevel: RiskLevel;

  @Column({ type: 'boolean', default: false })
  isFlagged: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  flagReason?: string;

  @Column({ type: 'jsonb', default: [] })
  riskFactors: RiskFactor[];

  @Column({ type: 'jsonb', default: [] })
  evaluationHistory: RiskEvaluationLog[];

  @Column({ type: 'timestamp', nullable: true })
  riskEvaluatedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  flaggedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  flaggedBy?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  adminNotes?: string;

  @Column({ type: 'varchar', length: 50, default: 'PENDING_REVIEW' })
  reviewStatus: 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'ESCALATED';

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ type: 'boolean', default: false })
  autoProcessed: boolean;

  @Column({ type: 'jsonb', nullable: true })
  velocityData?: {
    transactionsInLastHour: number;
    totalAmountInLastHour: number;
    transactionsInLastDay: number;
    totalAmountInLastDay: number;
    averageTransactionAmount: number;
  };

  @Column({ type: 'jsonb', nullable: true })
  deviceContext?: {
    deviceId?: string;
    isNewDevice: boolean;
    deviceTrustScore?: number;
    lastLoginFromDevice?: Date;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
