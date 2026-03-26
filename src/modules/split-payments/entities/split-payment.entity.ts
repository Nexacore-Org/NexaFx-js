import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToMany } from 'typeorm';
import { SplitContribution } from './split-contribution.entity';

export enum SplitStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

@Entity('split_payments')
export class SplitPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  initiatorId: string;

  @Column('decimal', { precision: 15, scale: 2 })
  totalAmount: number;

  @Column({ type: 'enum', enum: SplitStatus, default: SplitStatus.PENDING })
  status: SplitStatus;

  @Column()
  expiryDate: Date;

  @OneToMany(() => SplitContribution, (contribution) => contribution.splitPayment)
  contributions: SplitContribution[];

  @CreateDateColumn()
  createdAt: Date;
}