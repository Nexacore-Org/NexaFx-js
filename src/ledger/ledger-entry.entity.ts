import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum LedgerEntryType {
  CREDIT = 'credit',
  DEBIT = 'debit',
}

@Entity('ledger_entries')
@Index(['userId', 'createdAt'])
@Index(['transactionId'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId: string | null;

  @Column({ type: 'enum', enum: LedgerEntryType })
  type: LedgerEntryType;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  balanceAfter: number;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
