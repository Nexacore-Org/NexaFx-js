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

@Entity('notification_preferences')
@Index(['userId', 'channel', 'eventType'], { unique: true })
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
