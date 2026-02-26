import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('risk_states')
export class RiskState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  totalEquity: number;

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  usedMargin: number;

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  freeMargin: number;

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  currentDailyPL: number;

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  currentVaR: number; // Value at Risk (95% confidence)

  @Column('decimal', { precision: 18, scale: 8, default: 0 })
  maxDrawdown: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  riskScore: number; // 0-100 score based on exposure/volatility

  @Column('jsonb', { default: {} })
  exposureBreakdown: Record<string, number>; // symbol -> net exposure amount

  @Column('jsonb', { nullable: true })
  limits: {
    maxLeverage?: number;
    maxDrawdown?: number;
    maxPositionSize?: number;
    restrictedSymbols?: string[];
    dailyLossLimit?: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
