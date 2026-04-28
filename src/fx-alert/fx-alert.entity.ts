import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AlertDirection {
  ABOVE = 'ABOVE',
  BELOW = 'BELOW',
}

export enum AlertStatus {
  ACTIVE = 'ACTIVE',
  TRIGGERED = 'TRIGGERED',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
}

export enum NotificationChannel {
  IN_APP = 'IN_APP',
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
}

@Entity('fx_alerts')
@Index(['userId', 'status'])
@Index(['pair', 'status'])
export class FxAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  @Index()
  userId: string;

  @Column({ type: 'varchar', length: 10 })
  pair: string; // e.g. "USD/NGN"

  @Column({ type: 'enum', enum: AlertDirection })
  direction: AlertDirection;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  threshold: number;

  @Column({
    type: 'simple-array',
    default: NotificationChannel.IN_APP,
  })
  channelPreferences: NotificationChannel[];

  @Column({ type: 'enum', enum: AlertStatus, default: AlertStatus.ACTIVE })
  status: AlertStatus;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  triggeredAt: Date | null;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  triggerRate: number | null; // the actual rate when triggered

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
