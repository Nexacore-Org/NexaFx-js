import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum ConversionStatus {
  QUOTED = 'quoted',
  EXECUTED = 'executed',
  REVERSED = 'reversed',
}

@Entity('conversions')
@Index(['userId', 'createdAt'])
export class Conversion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ length: 8 })
  fromCurrency: string;

  @Column({ length: 8 })
  toCurrency: string;

  @Column('decimal', { precision: 28, scale: 8 })
  fromAmount: string;

  @Column('decimal', { precision: 28, scale: 8 })
  toAmount: string;

  @Column('decimal', { precision: 18, scale: 8 })
  usedRate: string;

  @Column({ type: 'enum', enum: ConversionStatus, default: ConversionStatus.QUOTED })
  status: ConversionStatus;

  @Column({ type: 'varchar', length: 64, nullable: true })
  quoteId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}


