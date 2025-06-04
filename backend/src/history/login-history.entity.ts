import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity('login_history')
export class LoginHistory {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  userId: number;

  @Column()
  email: string;

  @Column()
  ipAddress: string;

  @Column()
  userAgent: string;

  @Column({ default: true })
  isSuccessful: boolean;

  @Column({ nullable: true })
  failureReason: string;

  @Column({ nullable: true })
  location: string;

  @CreateDateColumn()
  createdAt: Date;
}