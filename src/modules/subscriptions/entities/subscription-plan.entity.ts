import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column('decimal', { precision: 12, scale: 2 })
  price: number;

  /** JSON map of feature flags, e.g. { "api_calls": true, "exports": false } */
  @Column({ type: 'jsonb', default: '{}' })
  featureFlags: Record<string, boolean>;

  /** JSON map of usage limits, e.g. { "api_calls": 1000, "exports": 50 } */
  @Column({ type: 'jsonb', default: '{}' })
  usageLimits: Record<string, number>;

  /** Per-unit overage fee for each limit type */
  @Column({ type: 'jsonb', default: '{}' })
  overageFees: Record<string, number>;
}
