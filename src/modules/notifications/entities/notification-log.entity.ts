import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NotificationLogStatus {
  SENT = 'sent',
  FAILED = 'failed',
  THROTTLED = 'throttled',
}

@Entity('notification_logs')
@Index(['userId', 'createdAt'])
@Index(['notificationType', 'createdAt'])
@Index(['channel', 'status'])
export class NotificationLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: true })
  @Index()
  userId: string | null;

  @Column({ name: 'notification_type' })
  notificationType: string;

  @Column({ nullable: true })
  channel: string | null;

  @Column({ type: 'enum', enum: NotificationLogStatus, default: NotificationLogStatus.SENT })
  status: NotificationLogStatus;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
