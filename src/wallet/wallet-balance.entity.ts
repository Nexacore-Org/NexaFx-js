import {
  Entity,
  Column,
  PrimaryColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('wallet_balances')
@Index(['accountId'])
export class WalletBalanceEntity {
  @PrimaryColumn()
  accountId: string;

  @PrimaryColumn()
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  balance: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}