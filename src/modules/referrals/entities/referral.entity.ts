import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type ReferralStatus = 'pending' | 'converted' | 'expired';

@Entity('referrals')
@Index('idx_referrals_referrer_id', ['referrerId'])
@Index('idx_referrals_referred_id', ['referredId'], { unique: true })
@Index('idx_referrals_code', ['code'])
export class ReferralEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** User who owns/generated the referral code */
  @Column({ type: 'uuid' })
  referrerId: string;

  /** User who signed up using the referral code (set after registration) */
  @Column({ type: 'uuid', nullable: true })
  referredId?: string;

  /** Unique alphanumeric referral code */
  @Column({ type: 'varchar', length: 12, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: ReferralStatus;

  /** Set when the referred user completes their first transaction */
  @Column({ type: 'timestamp', nullable: true })
  convertedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
