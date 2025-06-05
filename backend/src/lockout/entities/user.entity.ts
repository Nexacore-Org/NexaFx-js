import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ default: 0 })
  failedLoginAttempts: number;

  @Column({ nullable: true })
  lockedUntil: Date;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Virtual property to check if account is locked
  get isLocked(): boolean {
    return this.lockedUntil && this.lockedUntil > new Date();
  }
}

