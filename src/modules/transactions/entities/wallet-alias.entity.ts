import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wallet_aliases')
@Index('idx_wallet_alias_user_id', ['userId'])
@Index('idx_wallet_alias_wallet_address', ['walletAddress'])
@Index('idx_wallet_alias_user_wallet', ['userId', 'walletAddress'], { unique: true })
export class WalletAliasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  walletAddress: string;

  @Column({ type: 'varchar', length: 100 })
  alias: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}