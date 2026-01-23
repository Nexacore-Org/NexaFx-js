import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type WebhookStatus = 'active' | 'disabled';

@Entity('webhook_subscriptions')
export class WebhookSubscriptionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'jsonb' })
  events: string[];

  // ⚠️ keep secret server-side only (never return in responses)
  @Column({ type: 'varchar', length: 255 })
  secret: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: WebhookStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
