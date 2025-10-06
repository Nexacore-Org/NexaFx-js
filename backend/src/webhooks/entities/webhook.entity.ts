import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { WebhookDelivery } from './webhook-delivery.entity';

export enum WebhookEvent {
  TRANSACTION_CREATED = 'transaction.created',
  TRANSACTION_COMPLETED = 'transaction.completed',
  TRANSACTION_FAILED = 'transaction.failed',
  KYC_APPROVED = 'kyc.approved',
  KYC_REJECTED = 'kyc.rejected',
}

@Entity('webhooks')
export class Webhook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  url: string;

  @Column()
  secret: string; // Used for signing payloads

  @Column({ type: 'simple-array' })
  subscribedEvents: WebhookEvent[];

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => WebhookDelivery, (delivery) => delivery.webhook)
  deliveries: WebhookDelivery[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}