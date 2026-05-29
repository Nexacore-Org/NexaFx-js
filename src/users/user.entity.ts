import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../auth/enums/role.enum';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: Role, default: Role.USER })
  role: Role;

  @Column({ default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true, type: 'varchar' })
  emailVerificationOtp: string | null;

  @Column({ nullable: true, type: 'timestamptz' })
  emailVerificationOtpExpiry: Date | null;

  @Column({ default: 0 })
  resendCount: number;

  @Column({ nullable: true, type: 'timestamptz' })
  resendWindowStart: Date | null;

  @Column({ nullable: true, type: 'varchar' })
  refreshToken: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
