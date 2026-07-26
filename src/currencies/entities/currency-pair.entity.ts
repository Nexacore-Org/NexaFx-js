import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';

@Entity('currency_pairs')
@Unique(['fromCurrency', 'toCurrency'])
export class CurrencyPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 10 })
  fromCurrency: string;

  @Column({ length: 10 })
  toCurrency: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  spreadPercent: number;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
