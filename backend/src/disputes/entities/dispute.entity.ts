import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from './user.entity';
import { Transaction } from './transaction.entity';
// Forward declarations to avoid circular imports
export interface Evidence {
  id: string;
  disputeId: string;
  uploaderId: string;
  s3Key: string;
  filename: string;
  mimeType: string;
  size: number;
  ocrText?: string;
  createdAt: Date;
}

export interface Comment {
  id: string;
  disputeId: string;
  authorId: string;
  content: string;
  createdAt: Date;
}

// Payload interfaces for different timeline entry types
export interface CreatedPayload {
  category: string;
  description: string;
  evidenceCount: number;
}

export interface StateChangePayload {
  from: string;
  to: string;
  reason?: string;
}

export interface CommentPayload {
  commentId: string;
  content: string;
  authorId: string;
}

export interface EvidencePayload {
  evidenceId: string;
  action: 'uploaded' | 'ocr_processed' | 'deleted';
  confidence?: number;
  textLength?: number;
  filename?: string;
}

export interface AssignmentPayload {
  assignedTo: string;
  method: 'auto-assignment' | 'manual';
  escalationLevel?: number;
  status?: 'pending_manual_assignment';
  reason?: string;
}

export interface NotificationPayload {
  type: 'approaching_sla' | 'sla_violation' | 'escalation_alert';
  slaDeadline?: Date;
  hoursRemaining?: number;
  escalationLevel?: number;
}

export interface EscalationPayload {
  reason: 'stale_dispute' | 'manual' | 'sla_violation';
  escalationLevel: number;
  lastActivity?: Date;
}

export interface ResolutionPayload {
  outcome: string;
  details: string;
  refundAmount?: string;
  reason?: string;
}

export interface RefundPayload {
  refundTransactionId: string;
  amount: string;
  reason: string;
  status: 'processed' | 'pending' | 'failed';
}

export interface SlaViolationPayload {
  slaDeadline: Date;
  violationTime: Date;
  escalationLevel: number;
  status: 'processed' | 'pending';
}

export interface AutoResolutionPayload {
  outcome?: string;
  details?: string;
  refundAmount?: string;
  reason: string;
  status: 'eligible' | 'not_eligible';
}

// Discriminated union for TimelineEntry
export type TimelineEntry =
  | {
      id: string;
      disputeId: string;
      type: 'created';
      actorId?: string;
      payload: CreatedPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'state_change';
      actorId?: string;
      payload: StateChangePayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'comment';
      actorId?: string;
      payload: CommentPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'evidence';
      actorId?: string;
      payload: EvidencePayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'assignment';
      actorId?: string;
      payload: AssignmentPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'notification';
      actorId?: string;
      payload: NotificationPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'escalation';
      actorId?: string;
      payload: EscalationPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'resolution';
      actorId?: string;
      payload: ResolutionPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'refund';
      actorId?: string;
      payload: RefundPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'sla_violation';
      actorId?: string;
      payload: SlaViolationPayload;
      createdAt: Date;
    }
  | {
      id: string;
      disputeId: string;
      type: 'auto_resolution';
      actorId?: string;
      payload: AutoResolutionPayload;
      createdAt: Date;
    };

export interface AuditLog {
  id: string;
  disputeId: string;
  actorId?: string;
  action: string;
  createdAt: Date;
}

export enum DisputeState {
  DRAFT = 'draft',
  OPEN = 'open',
  INVESTIGATING = 'investigating',
  ESCALATED = 'escalated',
  RESOLVED = 'resolved',
  CLOSED = 'closed',
  CANCELLED = 'cancelled',
  AUTO_RESOLVING = 'auto-resolving',
}

export enum DisputePriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum DisputeCategory {
  UNAUTHORIZED_TRANSACTION = 'unauthorized_transaction',
  TRANSACTION_FAILED = 'transaction_failed',
  WRONG_AMOUNT = 'wrong_amount',
  DUPLICATE_CHARGE = 'duplicate_charge',
  SERVICE_NOT_RECEIVED = 'service_not_received',
  TECHNICAL_ERROR = 'technical_error',
  FRAUD_SUSPECTED = 'fraud_suspected',
  OTHER = 'other',
}

export enum DisputeOutcome {
  USER_FAVOR = 'user_favor',
  MERCHANT_FAVOR = 'merchant_favor',
  SPLIT = 'split',
}

@Entity('disputes')
@Index(['userId'])
@Index(['transactionId'])
@Index(['state', 'priority'])
@Index(['assignedToId'])
@Index(['createdAt'])
@Index(['slaDeadline'])
export class Dispute {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  transactionId: string;

  @ManyToOne(() => Transaction, (transaction) => transaction.disputes)
  @JoinColumn({ name: 'transactionId' })
  transaction: Transaction;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.disputes)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({
    type: 'enum',
    enum: DisputeCategory,
  })
  category: DisputeCategory;

  @Column('decimal', { precision: 18, scale: 2, nullable: true })
  amountNaira: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({
    type: 'enum',
    enum: DisputeState,
    default: DisputeState.OPEN,
  })
  state: DisputeState;

  @Column({
    type: 'enum',
    enum: DisputePriority,
    default: DisputePriority.MEDIUM,
  })
  priority: DisputePriority;

  @Column({ nullable: true })
  assignedToId: string | null;

  @ManyToOne(() => User, (user) => user.assignedDisputes)
  @JoinColumn({ name: 'assignedToId' })
  assignedTo: User;

  @Column({ type: 'timestamp', nullable: true })
  slaDeadline: Date;

  @Column({
    type: 'enum',
    enum: DisputeOutcome,
    nullable: true,
  })
  outcome: DisputeOutcome;

  @Column({ type: 'text', nullable: true })
  outcomeDetails: string;

  @Column({ default: false })
  isDuplicate: boolean;

  @Column({ nullable: true })
  duplicateOfId: string;

  @Column({ nullable: true })
  escalationReason: string;

  @Column({ default: 0 })
  escalationLevel: number; // 0 = L1, 1 = L2, 2 = L3

  @Column({ nullable: true })
  resolutionNotes: string;

  @Column({ nullable: true })
  refundTransactionId: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  refundAmount: string;

  @Column({ default: false })
  isFraudulent: boolean;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  fraudScore: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany('Evidence', 'dispute')
  evidences: Evidence[];

  @OneToMany('Comment', 'dispute')
  comments: Comment[];

  @OneToMany('TimelineEntry', 'dispute')
  timeline: TimelineEntry[];

  @OneToMany('AuditLog', 'dispute')
  audits: AuditLog[];
}
