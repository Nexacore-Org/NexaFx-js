import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rate_limit_records')
@Index('idx_rate_limit_records_user_endpoint', ['userId', 'endpoint'], { unique: true })
export class RateLimitRecordEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  endpoint: string;

  @Column({ type: 'int', default: 0 })
  requestCount: number;

  @Column({ type: 'timestamptz' })
  windowStart: Date;

  @CreateDateColumn()
  createdAt: Date;
}
