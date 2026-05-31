import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('fx_trades')
@Index(['userId'])
@Index(['executedAt'])
export class FxTrade {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 10 })
  fromCurrency: string;

  @Column({ length: 10 })
  toCurrency: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  fromAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  toAmount: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  rate: number;

  @CreateDateColumn()
  executedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  reversedAt: Date;
}
