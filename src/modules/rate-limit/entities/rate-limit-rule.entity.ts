import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserTier = 'guest' | 'standard' | 'premium' | 'admin';
export type RiskLevel = 'low' | 'medium' | 'high';

@Entity('rate_limit_rules')
@Index('idx_rate_limit_rule_tier', ['tier'])
@Index('idx_rate_limit_rule_active', ['isActive'])
@Index('idx_rate_limit_rule_priority', ['priority'])
export class RateLimitRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // User tier this rule applies to
  @Column({ type: 'varchar', length: 20 })
  tier: UserTier;

  // Risk level this rule applies to (optional, null means all risk levels)
  @Column({ type: 'varchar', length: 20, nullable: true })
  riskLevel?: RiskLevel;

  // Rate limit configuration
  @Column({ type: 'int' })
  maxRequests: number; // Maximum requests allowed

  @Column({ type: 'int' })
  windowSeconds: number; // Time window in seconds

  // Route/endpoint matching (optional, null means all routes)
  @Column({ type: 'varchar', length: 255, nullable: true })
  routePattern?: string; // e.g., '/api/transactions/*' or '/api/webhooks'

  @Column({ type: 'varchar', length: 10, nullable: true })
  method?: string; // HTTP method (GET, POST, etc.) or null for all

  // Priority: higher priority rules are checked first
  @Column({ type: 'int', default: 0 })
  priority: number;

  // Whether this rule is currently active
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // Additional metadata
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
