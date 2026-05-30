import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('referrals')
@Index(['referrerId'])
@Index(['refereeId'], { unique: true })
@Index(['code'], { unique: true })
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  referrerId: string;

  @Index({ unique: true })
  @Column({ type: 'uuid', unique: true })
  refereeId: string;

  @Index({ unique: true })
  @Column({ unique: true })
  code: string;

  @Column({ default: false })
  rewardPaid: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
