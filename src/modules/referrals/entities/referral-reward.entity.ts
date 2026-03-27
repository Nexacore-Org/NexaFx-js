import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('referral_rewards')
@Index('idx_referral_rewards_referrer_id', ['referrerId'])
@Index('idx_referral_rewards_referral_id', ['referralId'], { unique: true })
export class ReferralRewardEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Referrer who earned the reward */
  @Column({ type: 'uuid' })
  referrerId: string;

  /** The referral that triggered this reward */
  @Column({ type: 'uuid', unique: true })
  referralId: string;

  /** Credit amount awarded */
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'boolean', default: false })
  disbursed: boolean;

  @Column({ type: 'timestamp', nullable: true })
  disbursedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
