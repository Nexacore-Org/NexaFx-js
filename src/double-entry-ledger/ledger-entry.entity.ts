import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeUpdate,
  BeforeRemove,
} from 'typeorm';

export enum EntryType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('ledger_entries')
@Index(['transactionId'])
@Index(['accountId'])
@Index(['currency'])
@Index(['timestamp'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  @Index()
  transactionId: string;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: '0',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  debit: number;

  @Column({
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: '0',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  credit: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'entry_type', type: 'enum', enum: EntryType })
  entryType: EntryType;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;

  @Column({ name: 'checksum', type: 'varchar', length: 64 })
  checksum: string;

  // Immutability guards
  @BeforeUpdate()
  preventUpdate() {
    throw new Error('Ledger entries are immutable and cannot be updated');
  }

  @BeforeRemove()
  preventDelete() {
    throw new Error('Ledger entries are immutable and cannot be deleted');
  }
}
