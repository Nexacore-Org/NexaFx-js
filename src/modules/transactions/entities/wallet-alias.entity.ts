// WalletAliasEntity so users can assign friendly names to wallets
// (issue #1277). Starting point -- the categorization and
// lifecycle/snapshot audit features from the same issue are separate
// follow-ups.
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('wallet_aliases')
@Index('idx_wallet_aliases_user_wallet', ['userId', 'walletAddress'], { unique: true })
export class WalletAliasEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  walletAddress: string;

  @Column({ type: 'varchar', length: 100 })
  alias: string;

  @CreateDateColumn()
  createdAt: Date;
}
