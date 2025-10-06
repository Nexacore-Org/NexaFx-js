import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
  BeforeInsert,
} from 'typeorm';
import { createHash } from 'crypto';
import { Dispute } from './dispute.entity';
import {
  CreatedPayload,
  StateChangePayload,
  CommentPayload,
  EvidencePayload,
  AssignmentPayload,
  NotificationPayload,
  EscalationPayload,
  ResolutionPayload,
  RefundPayload,
  SlaViolationPayload,
  AutoResolutionPayload,
} from './dispute.entity';

export enum TimelineEntryType {
  CREATED = 'created',
  STATE_CHANGE = 'state_change',
  COMMENT = 'comment',
  EVIDENCE = 'evidence',
  ASSIGNMENT = 'assignment',
  NOTIFICATION = 'notification',
  ESCALATION = 'escalation',
  RESOLUTION = 'resolution',
  REFUND = 'refund',
  SLA_VIOLATION = 'sla_violation',
  AUTO_RESOLUTION = 'auto_resolution',
}

@Entity('timeline_entries')
@Index(['disputeId'])
@Index(['type'])
@Index(['createdAt'])
@Index(['payloadHash'])
@Unique(['disputeId', 'type', 'payloadHash']) // Prevent duplicate entries for same dispute, type, and payload content
export class TimelineEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  disputeId: string;

  @ManyToOne(() => Dispute, (dispute) => dispute.timeline)
  @JoinColumn({ name: 'disputeId' })
  dispute: Dispute;

  @Column({
    type: 'enum',
    enum: TimelineEntryType,
  })
  type: TimelineEntryType;

  @Column({ nullable: true })
  actorId: string;

  @Column({ nullable: true })
  actorType: string; // 'user', 'agent', 'system'

  @Column({ type: 'jsonb' })
  payload:
    | CreatedPayload
    | StateChangePayload
    | CommentPayload
    | EvidencePayload
    | AssignmentPayload
    | NotificationPayload
    | EscalationPayload
    | ResolutionPayload
    | RefundPayload
    | SlaViolationPayload
    | AutoResolutionPayload;

  @Column({ type: 'varchar', length: 64 })
  payloadHash: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @BeforeInsert()
  generatePayloadHash() {
    if (this.payload) {
      const payloadString = JSON.stringify(
        this.payload,
        Object.keys(this.payload).sort(),
      );
      this.payloadHash = createHash('sha256')
        .update(payloadString)
        .digest('hex');
    }
  }
}
