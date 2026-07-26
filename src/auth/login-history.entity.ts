import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../users/user.entity';

@Entity('login_history')
@Index(['userId', 'createdAt'])
export class LoginHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  country: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ default: true })
  success: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
