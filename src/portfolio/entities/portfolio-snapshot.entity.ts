import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('portfolio_snapshots')
@Index(['userId', 'createdAt'])
@Index(['snapshotDate'])
export class PortfolioSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'jsonb' })
  holdings: Record<string, number>;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  totalValueUsd: number;

  @Column({ type: 'timestamp' })
  snapshotDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}
