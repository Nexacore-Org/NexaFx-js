import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Dispute } from './dispute.entity';

// Actor type enumeration
export enum ActorType {
  USER = 'user',
  AGENT = 'agent',
  SYSTEM = 'system',
}

// Audit action enumeration
export enum AuditAction {
  CREATE_DISPUTE = 'CREATE_DISPUTE',
  UPDATE_DISPUTE = 'UPDATE_DISPUTE',
  ASSIGN_DISPUTE = 'ASSIGN_DISPUTE',
  RESOLVE_DISPUTE = 'RESOLVE_DISPUTE',
  ESCALATE_DISPUTE = 'ESCALATE_DISPUTE',
  REFUND_INITIATED = 'REFUND_INITIATED',
  CREATE_DISPUTE_WITH_EVIDENCE = 'CREATE_DISPUTE_WITH_EVIDENCE',
  OCR_PROCESSED = 'OCR_PROCESSED',
}

// Base metadata interface
interface BaseAuditMetadata {
  [key: string]: unknown;
}

// Specific metadata types for different actions
interface CreateDisputeMetadata extends BaseAuditMetadata {
  transactionId: string;
  category: string;
  priority: number;
}

interface UpdateDisputeMetadata extends BaseAuditMetadata {
  // Contains the fields being updated
  [key: string]: unknown;
}

interface AssignDisputeMetadata extends BaseAuditMetadata {
  agentId: string;
  previousAgentId?: string;
  notes?: string;
}

interface ResolveDisputeMetadata extends BaseAuditMetadata {
  outcome: string;
  outcomeDetails: string;
  resolutionNotes?: string;
  refundAmount?: number;
  refundTransactionId?: string;
}

interface EscalateDisputeMetadata extends BaseAuditMetadata {
  reason: string;
  escalationLevel: number;
  previousState: string;
}

interface RefundInitiatedMetadata extends BaseAuditMetadata {
  refundAmount: number;
  reason: string;
  jobId: string | number;
}

interface CreateDisputeWithEvidenceMetadata extends BaseAuditMetadata {
  transactionId: string;
  category: string;
  priority: number;
  evidenceCount: number;
}

interface OcrProcessedMetadata extends BaseAuditMetadata {
  evidenceId: string;
  confidence: number;
  textLength: number;
}

// Discriminated union type for all possible audit metadata
export type AuditMetadata =
  | ({ action: AuditAction.CREATE_DISPUTE } & CreateDisputeMetadata)
  | ({ action: AuditAction.UPDATE_DISPUTE } & UpdateDisputeMetadata)
  | ({ action: AuditAction.ASSIGN_DISPUTE } & AssignDisputeMetadata)
  | ({ action: AuditAction.RESOLVE_DISPUTE } & ResolveDisputeMetadata)
  | ({ action: AuditAction.ESCALATE_DISPUTE } & EscalateDisputeMetadata)
  | ({ action: AuditAction.REFUND_INITIATED } & RefundInitiatedMetadata)
  | ({
      action: AuditAction.CREATE_DISPUTE_WITH_EVIDENCE;
    } & CreateDisputeWithEvidenceMetadata)
  | ({ action: AuditAction.OCR_PROCESSED } & OcrProcessedMetadata)
  | ({ action: string } & BaseAuditMetadata); // Fallback for unknown actions

@Entity('audit_logs')
@Index(['disputeId'])
@Index(['actorId'])
@Index(['action'])
@Index(['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  disputeId: string;

  @ManyToOne(() => Dispute, (dispute) => dispute.audits)
  @JoinColumn({ name: 'disputeId' })
  dispute: Dispute;

  @Column({ nullable: true })
  actorId: string;

  @Column({
    type: 'enum',
    enum: ActorType,
    nullable: true,
  })
  actorType: ActorType;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({ type: 'jsonb', nullable: true })
  meta: AuditMetadata | null;

  @Column({ nullable: true })
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @CreateDateColumn()
  createdAt: Date;
}
