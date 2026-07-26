import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('exchange_rate_cache')
@Index('idx_exchange_rate_cache_pair', ['pair'])
@Index('idx_exchange_rate_cache_expires_at', ['expiresAt'])
export class ExchangeRateCacheEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  pair: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rate: number;

  @Column({ type: 'varchar', length: 50 })
  source: string;

  @CreateDateColumn()
  cachedAt: Date;

  @Column({ type: 'timestamp' })
  expiresAt: Date;
}
