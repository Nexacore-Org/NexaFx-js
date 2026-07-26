import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum RewardType {
  CREDIT = 'credit',
  DISCOUNT = 'discount',
}

export enum RewardStatus {
  PENDING = 'pending',
  PAID = 'paid',
}

@Entity('referral_rewards')
@Index(['referralId'])
export class ReferralReward {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  referralId!: string;

  @Column({ type: 'simple-enum', enum: RewardType })
  rewardType!: RewardType;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount!: number;

  @Column({ length: 10 })
  currency!: string;

  @Column({ type: 'simple-enum', enum: RewardStatus, default: RewardStatus.PENDING })
  status!: RewardStatus;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  paidAt!: Date | null;
}
