import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Index } from 'typeorm';
import { SplitPayment } from './split-payment.entity';

@Entity('split_contributions')
export class SplitContribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => SplitPayment, (split) => split.contributions)
  splitPayment: SplitPayment;

  @Index()
  @Column()
  participantId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  amount: number;

  @Column({ default: false })
  hasPaid: boolean;

  @Column({ nullable: true })
  transactionId: string;
}