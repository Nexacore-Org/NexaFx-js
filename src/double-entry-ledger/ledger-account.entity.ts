import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  VersionColumn,
} from 'typeorm';

export enum AccountType {
  ASSET = 'ASSET',
  LIABILITY = 'LIABILITY',
  EQUITY = 'EQUITY',
  REVENUE = 'REVENUE',
  EXPENSE = 'EXPENSE',
}

@Entity('ledger_accounts')
@Index(['userId'])
@Index(['currency'])
export class LedgerAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index()
  userId: string;

  @Column({ name: 'account_type', type: 'enum', enum: AccountType })
  accountType: AccountType;

  @Column({ length: 10 })
  currency: string;

  @Column({ length: 100 })
  name: string;

  @Column({
    name: 'derived_balance',
    type: 'decimal',
    precision: 20,
    scale: 8,
    default: '0',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  derivedBalance: number;

  @Column({ name: 'is_system_account', type: 'boolean', default: false })
  isSystemAccount: boolean;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
