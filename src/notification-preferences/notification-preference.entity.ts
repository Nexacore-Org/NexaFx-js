import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum NotificationChannel {
  EMAIL = 'email',
  PUSH = 'push',
  IN_APP = 'in_app',
  SMS = 'sms',
}

export enum NotificationEventType {
  TRANSACTION = 'transaction',
  SECURITY = 'security',
  KYC = 'kyc',
  PROMOTIONAL = 'promotional',
  SYSTEM = 'system',
}

export function preferenceKey(
  channel: NotificationChannel,
  eventType: NotificationEventType,
): string {
  return `${channel}:${eventType}`;
}

export const MANDATORY_NOTIFICATION_COMBINATIONS: ReadonlySet<string> = new Set(
  [
    preferenceKey(NotificationChannel.EMAIL, NotificationEventType.SECURITY),
    preferenceKey(NotificationChannel.PUSH, NotificationEventType.SECURITY),
  ],
);

export function isMandatoryPreference(
  channel: NotificationChannel,
  eventType: NotificationEventType,
): boolean {
  return MANDATORY_NOTIFICATION_COMBINATIONS.has(
    preferenceKey(channel, eventType),
  );
}

@Entity('notification_preferences')
@Index(
  'UQ_notification_preferences_user_channel_event',
  ['userId', 'channel', 'eventType'],
  { unique: true },
)
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'simple-enum', enum: NotificationChannel })
  channel!: NotificationChannel;

  @Column({ type: 'simple-enum', enum: NotificationEventType })
  eventType!: NotificationEventType;

  @Column({ default: true })
  isEnabled!: boolean;

  @Column({ type: 'boolean', default: true })
  batchingEnabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
