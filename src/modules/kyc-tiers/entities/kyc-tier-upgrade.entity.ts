import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type KycTierUpgradeStatus = 'pending' | 'approved' | 'rejected';

@Entity('kyc_tier_upgrades')
@Index('idx_kyc_tier_upgrades_user_id', ['userId'])
@Index('idx_kyc_tier_upgrades_status', ['status'])
@Index('idx_kyc_tier_upgrades_created_at', ['createdAt'])
export class KycTierUpgradeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  currentTier: string;

  @Column({ type: 'varchar', length: 20 })
  requestedTier: string;

  @Column({ type: 'jsonb', default: {} })
  documents: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: KycTierUpgradeStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
