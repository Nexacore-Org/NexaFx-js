import {
  Check,
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ReferralStatus {
  PENDING = 'pending',
  QUALIFIED = 'qualified',
  REWARDED = 'rewarded',
}

@Entity('referrals')
@Index(['referrerId'])
@Index(['referralCode'])
@Index(['referrerId', 'status'])
@Check(`"referrerId" <> "referredId"`)
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  referrerId!: string;

  @Column({ type: 'uuid', unique: true })
  referredId!: string;

  /** The code that was used, kept for reporting. Many referrals share one code. */
  @Column()
  referralCode!: string;

  @Column({
    type: 'simple-enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status!: ReferralStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  qualifiedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  rewardedAt!: Date | null;

  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;
}
