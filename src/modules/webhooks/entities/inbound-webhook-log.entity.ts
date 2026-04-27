import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export type WebhookLogStatus = 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'UNHANDLED';

@Entity('inbound_webhook_logs')
@Index(['eventName', 'status'])
@Index(['deliveryId'], { unique: true })
@Index(['receivedAt'])
export class InboundWebhookLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  eventName: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  deliveryId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({
    type: 'enum',
    enum: ['PROCESSING', 'PROCESSED', 'FAILED', 'UNHANDLED'],
    default: 'PROCESSING',
  })
  status: WebhookLogStatus;

  @Column({ type: 'text', nullable: true })
  processingResult?: string;

  @Column({ type: 'int', nullable: true })
  processingTime?: number; // in milliseconds

  @CreateDateColumn({ name: 'received_at' })
  receivedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date;
}
