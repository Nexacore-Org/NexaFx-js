import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('suspicious_activities')
@Index(['ipAddress', 'timestamp'])
@Index(['userId', 'timestamp'])
@Index(['riskScore', 'timestamp'])
export class SuspiciousActivity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  @Column()
  ipAddress: string;

  @Column('text')
  userAgent: string;

  @Column({
    type: 'enum',
    enum: ['LOGIN_ATTEMPT', 'FAILED_LOGIN', 'IP_CHANGE', 'RAPID_REQUESTS'],
  })
  activityType: string;

  @CreateDateColumn()
  timestamp: Date;

  @Column('json', { nullable: true })
  details: any;

  @Column('decimal', { precision: 5, scale: 2 })
  riskScore: number;
}