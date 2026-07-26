import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('exchange_rate_history')
@Index('idx_exchange_rate_history_pair', ['pair'])
@Index('idx_exchange_rate_history_recorded_at', ['recordedAt'])
@Index('idx_exchange_rate_history_pair_recorded_at', ['pair', 'recordedAt'])
export class ExchangeRateHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  pair: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rate: number;

  @Column({ type: 'varchar', length: 50 })
  source: string;

  @CreateDateColumn()
  recordedAt: Date;
}
