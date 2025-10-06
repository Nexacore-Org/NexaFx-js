import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
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
@Unique(['disputeId', 'type', 'payload']) // Prevent duplicate entries for same dispute, type, and payload
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

  @Column({ type: 'text', nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;
}
