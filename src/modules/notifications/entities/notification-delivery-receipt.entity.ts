import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum DeliveryChannel {
  IN_APP = 'in_app',
  PUSH = 'push',
  SMS = 'sms',
  EMAIL = 'email',
}

export enum DeliveryStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('notification_delivery_receipts')
@Index(['userId', 'notificationId'])
@Index(['channel', 'status'])
export class NotificationDeliveryReceiptEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'notification_id' })
  @Index()
  notificationId: string;

  @Column({ name: 'user_id' })
  @Index()
  userId: string;

  @Column({ name: 'notification_type' })
  notificationType: string;

  @Column({ type: 'enum', enum: DeliveryChannel })
  channel: DeliveryChannel;

  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  @Column({ name: 'error_detail', type: 'text', nullable: true })
  errorDetail: string | null;

  @Column({ name: 'provider_message_id', nullable: true })
  providerMessageId: string | null;

  @Column({ name: 'attempted_at', type: 'timestamptz', nullable: true })
  attemptedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
