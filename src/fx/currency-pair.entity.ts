import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('currency_pairs')
@Index(['fromCurrency', 'toCurrency'], { unique: true })
export class CurrencyPair {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 10 })
  fromCurrency: string;

  @Column({ length: 10 })
  toCurrency: string;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0.005 })
  spreadPercent: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
