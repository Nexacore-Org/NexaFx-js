import { Entity, PrimaryGeneratedColumn, Column, Index } from 'typeorm';

@Entity('loyalty_balance_snapshots')
@Index(['userId', 'snapshotDate'])
export class LoyaltyBalanceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  snapshotDate: string;

  @Column({ type: 'int' })
  balance: number;
}
