import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Webhook } from './webhook.entity';

export enum DeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  webhookId: string;

  @ManyToOne(() => Webhook)
  @JoinColumn({ name: 'webhookId' })
  webhook: Webhook;
  
  @Column()
  eventName: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;
  
  @Column({ type: 'enum', enum: DeliveryStatus, default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  @Column({ nullable: true })
  responseStatusCode?: number;

  @Column({ type: 'text', nullable: true })
  responseBody?: string;

  @CreateDateColumn()
  timestamp: Date;
}