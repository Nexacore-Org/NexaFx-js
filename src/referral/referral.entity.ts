import {
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
@Index(['referredId'], { unique: true })
@Index(['referralCode'], { unique: true })
@Index(['referrerId', 'status'])
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  referrerId!: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', unique: true })
  referredId!: string;

  @Index({ unique: true })
  @Column({ unique: true })
  referralCode!: string;

  @Column({ type: 'simple-enum', enum: ReferralStatus, default: ReferralStatus.PENDING })
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
