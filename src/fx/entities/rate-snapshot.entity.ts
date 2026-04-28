import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

export type Granularity = '1h' | '1d';

@Entity('rate_snapshots')
@Index(['currencyPair', 'snapshotAt', 'granularity'], { unique: true })
export class RateSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  currencyPair: string; // e.g. USD/NGN

  @Column('decimal', { precision: 18, scale: 6 })
  open: number;

  @Column('decimal', { precision: 18, scale: 6 })
  high: number;

  @Column('decimal', { precision: 18, scale: 6 })
  low: number;

  @Column('decimal', { precision: 18, scale: 6 })
  close: number;

  @Column({ type: 'timestamp' })
  snapshotAt: Date;

  @Column({ type: 'varchar' })
  granularity: Granularity;

  @CreateDateColumn()
  createdAt: Date;
}
