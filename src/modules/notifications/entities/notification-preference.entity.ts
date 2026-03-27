import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export const NOTIFICATION_TYPES = [
  'transaction.completed',
  'transaction.failed',
  'transaction.pending',
  'device.login',
  'webhook.failed',
  'retry.job.failed',
  'goal.completed',
  'goal.milestone',
  'cashflow.warning',
  'fraud.alert',
  'SECURITY',
] as const;

export type NotificationPreferenceType = (typeof NOTIFICATION_TYPES)[number];

export enum DeliveryChannelPref {
  IN_APP = 'in_app',
  PUSH = 'push',
  SMS = 'sms',
  EMAIL = 'email',
}

@Entity('notification_preferences')
@Index('idx_notif_pref_user_type', ['userId', 'notificationType'], { unique: true })
export class NotificationPreferenceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  notificationType: string;

  @Column({ type: 'boolean', default: true })
  inApp: boolean;

  @Column({ type: 'boolean', default: true })
  push: boolean;

  @Column({ type: 'boolean', default: false })
  sms: boolean;

  @Column({ type: 'boolean', default: true })
  email: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
