import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../user/user.entity'; // Adjust import path as needed

@Entity('devices')
export class Device {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, user => user.devices, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userAgent: string;

  @Column()
  ipAddress: string;

  @Column({ nullable: true })
  deviceName?: string;

  @Column({ nullable: true })
  deviceType?: string; // mobile, desktop, tablet

  @Column({ default: true })
  isActive: boolean;

  @Column({ nullable: true })
  lastUsedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
