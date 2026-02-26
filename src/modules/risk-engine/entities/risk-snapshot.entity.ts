import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('risk_snapshots')
@Index('idx_risk_snapshots_user_timestamp', ['userId', 'timestamp'])
export class RiskSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column('decimal', { precision: 18, scale: 8 })
  equity: number;

  @Column('decimal', { precision: 18, scale: 8 })
  margin: number;

  @Column('decimal', { precision: 18, scale: 8 })
  dailyPL: number;

  @Column('decimal', { precision: 18, scale: 8 })
  var: number;

  @Column('decimal', { precision: 18, scale: 8 })
  maxDrawdown: number;

  @Column('decimal', { precision: 5, scale: 2 })
  riskScore: number;

  @Column('jsonb')
  metrics: {
    exposureByAsset: Record<string, number>;
    leverage: number;
    stressTestResults?: Record<string, number>; // Scenario Name -> Estimated PnL
  };
}
