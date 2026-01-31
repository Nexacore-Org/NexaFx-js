import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rate_limit_trackers')
@Index('idx_rate_limit_tracker_key', ['trackerKey'])
@Index('idx_rate_limit_tracker_expires', ['expiresAt'])
@Index('idx_rate_limit_tracker_user', ['userId'])
@Index('idx_rate_limit_tracker_rule', ['ruleId'])
export class RateLimitTrackerEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Unique key for tracking (e.g., userId, IP address, or combination)
  @Column({ type: 'varchar', length: 255 })
  trackerKey: string;

  // User ID if authenticated (nullable for guest users)
  @Column({ type: 'varchar', length: 255, nullable: true })
  userId?: string;

  // IP address
  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  // Rule ID this tracker is for
  @Column({ type: 'uuid' })
  ruleId: string;

  // Current request count in the window
  @Column({ type: 'int', default: 0 })
  requestCount: number;

  // When this tracker expires (end of current window)
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  // Window start time
  @Column({ type: 'timestamptz' })
  windowStart: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
