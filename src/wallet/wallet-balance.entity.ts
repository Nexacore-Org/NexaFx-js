import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  VersionColumn,
} from 'typeorm';

@Entity('wallet_balances')
@Index(['accountId', 'currency'], { unique: true })
export class WalletBalanceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 36 })
  accountId: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  balance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @VersionColumn()
  version: number;
}
}
