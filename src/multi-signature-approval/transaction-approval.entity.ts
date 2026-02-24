import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { Transaction } from './transaction.entity';

export enum ApprovalDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity('transaction_approvals')
@Index(['transactionId', 'approverId'], { unique: true })
export class TransactionApproval {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid' })
  approverId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approverEmail: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  approverRole: string;

  @Column({
    type: 'enum',
    enum: ApprovalDecision,
  })
  decision: ApprovalDecision;

  @Column({ type: 'text', nullable: true })
  comment: string;

  @CreateDateColumn()
  timestamp: Date;

  @ManyToOne(() => Transaction, (transaction) => transaction.approvals, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;
}
