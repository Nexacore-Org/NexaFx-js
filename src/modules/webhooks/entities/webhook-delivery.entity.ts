import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WebhookDeliveryStatus = 'pending' | 'success' | 'failed';

@Entity('webhook_deliveries')
export class WebhookDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  subscriptionId: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  eventName: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: WebhookDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'int', nullable: true })
  lastHttpStatus?: number;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
