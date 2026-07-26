import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('wallet_balance_snapshots')
@Index('idx_wallet_balance_snapshots_user_date', ['userId', 'snapshotDate'])
@Index('idx_wallet_balance_snapshots_user_id', ['userId'])
export class WalletBalanceSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  balances: Record<string, number>;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  totalValueUsd: number;

  @Column({ type: 'timestamp' })
  snapshotDate: Date;

  @CreateDateColumn()
  createdAt: Date;
}
