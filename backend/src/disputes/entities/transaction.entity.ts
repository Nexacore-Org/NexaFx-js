import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Dispute } from './dispute.entity';

export enum TransactionStatus {
  COMPLETED = 'completed',
  FAILED = 'failed',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
}

@Entity('transactions')
export class Transaction {
  @PrimaryColumn()
  id: string;

  @Index()
  @Column()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('decimal', { precision: 18, scale: 2 })
  amountNaira: string;

  @Column({ default: 'NGN' })
  currency: string;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ nullable: true })
  description: string | null;

  @Column({ nullable: true })
  merchantId: string | null;

  @Column({ nullable: true })
  reference: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Dispute, (dispute) => dispute.transaction)
  disputes: Dispute[];
}
