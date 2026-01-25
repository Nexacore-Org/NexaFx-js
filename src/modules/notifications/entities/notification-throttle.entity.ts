import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type NotificationType =
  | 'transaction.completed'
  | 'transaction.failed'
  | 'device.login'
  | 'webhook.failed'
  | 'retry.job.failed'
  | string;

@Entity('notification_throttles')
export class NotificationThrottleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The type of notification being throttled
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  notificationType: NotificationType;

  // Maximum number of notifications to batch
  @Column({ type: 'int', default: 10 })
  maxBatchSize: number;

  // Window duration in seconds before flushing batch
  @Column({ type: 'int', default: 300 })
  windowSeconds: number;

  // Cooldown period in seconds between batches
  @Column({ type: 'int', default: 60 })
  cooldownSeconds: number;

  // Is throttling enabled for this notification type?
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  // Current batch count
  @Column({ type: 'int', default: 0 })
  currentBatchCount: number;

  // When the current batch was started
  @Column({ type: 'timestamptz', nullable: true })
  batchStartedAt?: Date;

  // When the last batch was sent
  @Column({ type: 'timestamptz', nullable: true })
  lastSentAt?: Date;

  // Pending notifications count (in queue)
  @Column({ type: 'int', default: 0 })
  pendingCount: number;

  // Metadata for custom throttle behavior
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
