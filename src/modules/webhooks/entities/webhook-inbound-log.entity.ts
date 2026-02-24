import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type WebhookVerificationStatus = 'accepted' | 'rejected';

export type WebhookRejectionReason =
  | 'MISSING_HEADERS'
  | 'INVALID_SIGNATURE'
  | 'TIMESTAMP_TOO_OLD'
  | 'REPLAY_DETECTED'
  | null;

@Entity('webhook_inbound_logs')
@Index('idx_wh_inbound_delivery_id', ['deliveryId'], { unique: true })
@Index('idx_wh_inbound_status', ['status'])
@Index('idx_wh_inbound_created_at', ['createdAt'])
export class WebhookInboundLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // The x-nexafx-delivery-id sent by the caller — used for replay detection
  @Column({ type: 'varchar', length: 255, nullable: true })
  deliveryId?: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  eventName?: string;

  @Column({
    type: 'enum',
    enum: ['accepted', 'rejected'],
    default: 'accepted',
  })
  status: WebhookVerificationStatus;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rejectionReason?: WebhookRejectionReason;

  @Column({ type: 'varchar', length: 255, nullable: true })
  receivedSignature?: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  timestamp?: string;

  @CreateDateColumn()
  createdAt: Date;
}
