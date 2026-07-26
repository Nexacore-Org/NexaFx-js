import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('user_accounts')
@Index(['email'], { unique: true })
@Index(['deletedAt'])
@Index(['piiPurgeAt'])
export class UserAccount {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'text' })
  email: string;

  @Column({ type: 'text' })
  displayName: string;

  @Column({ type: 'text' })
  passwordSalt: string;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'text' })
  twoFactorSecret: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  piiPurgeAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  piiPurgedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  finalEmailSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
