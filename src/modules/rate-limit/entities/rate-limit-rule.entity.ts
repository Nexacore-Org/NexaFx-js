// RateLimitRuleEntity for the admin-configurable rate-limit system
// (issue #1273). Starting point — the tracker/violation-log entities,
// service, guard, admin controller, and cleanup worker are separate
// follow-ups.
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('rate_limit_rules')
@Index('idx_rate_limit_rules_endpoint', ['endpoint'], { unique: true })
export class RateLimitRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  endpoint: string;

  @Column({ type: 'int' })
  maxRequests: number;

  @Column({ type: 'int', comment: 'Window length in seconds' })
  windowSeconds: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
