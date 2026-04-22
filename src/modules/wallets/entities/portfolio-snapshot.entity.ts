import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('portfolio_snapshots')
@Index('idx_portfolio_snapshots_user_date', ['userId', 'snapshotDate'])
export class PortfolioSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 10 })
  displayCurrency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  totalValue: number;

  @Column({ type: 'jsonb' })
  walletBreakdown: Array<{ walletId: string; currency: string; value: number; fxRate: number }>;

  @Column({ type: 'jsonb', nullable: true })
  fxRates: Record<string, number> | null;

  @Column({ type: 'date' })
  snapshotDate: string;

  @CreateDateColumn()
  createdAt: Date;
}
