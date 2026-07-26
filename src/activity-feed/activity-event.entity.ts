import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('activity_events')
@Index(['userId', 'createdAt'])
@Index(['type'])
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  type: string;

  @Column('text')
  description: string;

  @Column({ nullable: true })
  ipAddress: string | null;

  @Column({ nullable: true })
  deviceInfo: string | null;

  @Column({ default: false })
  securityEvent: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
