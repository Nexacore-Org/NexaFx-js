import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  COMPLIANCE = 'compliance',
}

export enum KycStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

/** Verification tier that determines transaction limits and fees. */
export enum KycTier {
  NONE = 'NONE',
  BASIC = 'BASIC',
  ADVANCED = 'ADVANCED',
  VERIFIED = 'VERIFIED',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email!: string;

  @Column()
  passwordHash!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ type: 'simple-enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ default: false })
  isEmailVerified!: boolean;

  @Column({
    type: 'simple-enum',
    enum: KycStatus,
    default: KycStatus.PENDING,
  })
  kycStatus!: KycStatus;

  /** Bumped on role/status changes so tokens issued before the change stop working. */
  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({ default: true })
  isActive!: boolean;

  /** Soft-delete marker set when the account is closed. */
  @DeleteDateColumn({ type: 'timestamp', nullable: true })
  deletedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  closedAt!: Date | null;

  /** When personal data becomes eligible for anonymisation. */
  @Column({ type: 'timestamp', nullable: true })
  piiPurgeAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  piiPurgedAt!: Date | null;

  /** ISO 639-1 language code used to localize outbound emails, e.g. 'en', 'fr'. */
  @Column({ type: 'varchar', length: 2, default: 'en' })
  preferredLanguage!: string;

  @Column({ type: 'datetime', nullable: true, default: null })
  passwordChangedAt!: Date | null;

  /** Enforce 2FA for admin accounts. When true, admin login requires a valid TOTP code. */
  @Column({ type: 'boolean', default: false })
  require2fa!: boolean;

  /** Consecutive failed login attempts (resets on success). */
  @Column({ type: 'int', default: 0 })
  failedLoginAttempts!: number;

  /** Timestamp after which the account is unlocked; null means not locked. */
  @Column({ type: 'datetime', nullable: true, default: null })
  lockedUntil!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
