import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Check } from 'typeorm';
import { Min, Max } from 'class-validator';

@Entity('currency_pairs')
@Check('CHK_spread_percent_range', '"spreadPercent" >= 0 AND "spreadPercent" <= 5')
export class CurrencyPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 10 })
  fromCurrency: string;

  @Column({ length: 10 })
  toCurrency: string;

  @Column({ name: 'spreadPercent', type: 'decimal', precision: 5, scale: 2, default: 0 })
  @Min(0)
  @Max(5)
  spreadPercent: number;

  @Column({ default: true, name: 'isActive' })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
