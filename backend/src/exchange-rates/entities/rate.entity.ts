import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('exchange_rates')
@Index(['base', 'quote'], { unique: true })
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 8 })
  base: string; // e.g., NGN

  @Column({ length: 8 })
  quote: string; // e.g., USD

  @Column('decimal', { precision: 18, scale: 8 })
  rate: string; // store as string to avoid FP issues

  @Column('decimal', { precision: 6, scale: 4, default: 0 })
  margin: string; // spread as fraction, e.g., 0.015

  @UpdateDateColumn()
  updatedAt: Date;
}

@Entity('rate_history')
@Index(['base', 'quote', 'timestamp'])
export class RateHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 8 })
  base: string;

  @Column({ length: 8 })
  quote: string;

  @Column('decimal', { precision: 18, scale: 8 })
  rate: string;

  @CreateDateColumn({ type: 'timestamp' })
  timestamp: Date;
}


