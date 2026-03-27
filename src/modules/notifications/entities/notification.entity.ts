import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('notifications')
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
@Index('idx_notifications_user_read', ['userId', 'isRead'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 100 })
  type: string;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'jsonb', nullable: true })
  data?: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  readAt?: Date;

  @Column({ type: 'boolean', default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
