import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** One stable code per user, independent of any particular referee. */
@Entity('referral_codes')
export class ReferralCode {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true })
  ownerId!: string;

  @Column({ unique: true })
  code!: string;

  @CreateDateColumn()
  createdAt!: Date;
}
