import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';

@Entity('users')
@Index('idx_users_email', ['email'], { unique: true })
@Index('idx_users_deleted_at', ['deletedAt']) // Index for soft deletes
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  firstName?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastName?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash?: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'inactive' | 'suspended' | 'deleted';

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn() // Soft delete column
  deletedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetTokenHash?: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiry?: Date;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationTokenHash?: string;

  // Refresh token rotation
  @Column({ type: 'varchar', length: 255, nullable: true })
  refreshTokenHash?: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  refreshTokenFamily?: string;

  @Column({ type: 'timestamp', nullable: true })
  refreshTokenExpiry?: Date;

  // 2FA fields
  @Column({ type: 'varchar', length: 255, nullable: true })
  twoFactorSecret?: string;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ type: 'simple-array', nullable: true })
  twoFactorBackupCodes?: string[];
}