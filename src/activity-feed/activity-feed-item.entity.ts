import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum ActivityType {
  TRANSACTION = 'transaction',
  KYC = 'kyc',
  LOGIN = 'login',
  PROFILE_UPDATE = 'profile_update',
  WALLET = 'wallet',
}

@Entity('activity_feed_items')
@Index('IDX_activity_feed_items_user_created', ['userId', 'createdAt'])
@Index('IDX_activity_feed_items_type', ['type'])
@Index('IDX_activity_feed_items_user_read', ['userId', 'isRead'])
export class ActivityFeedItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'simple-enum', enum: ActivityType })
  type!: ActivityType;

  @Column()
  title!: string;

  @Column('text')
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ default: false })
  isRead!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
