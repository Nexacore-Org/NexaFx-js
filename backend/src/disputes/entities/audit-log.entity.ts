import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  BeforeInsert,
} from 'typeorm';
import { Dispute } from './dispute.entity';
import { createHash } from 'crypto';

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
  | CreateDisputeMetadata
  | UpdateDisputeMetadata
  | AssignDisputeMetadata
  | ResolveDisputeMetadata
  | EscalateDisputeMetadata
  | RefundInitiatedMetadata
  | CreateDisputeWithEvidenceMetadata
  | OcrProcessedMetadata
  | BaseAuditMetadata; // Fallback for unknown actions

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

  // Stores an anonymized IP by default. If SECURITY_FULL_IP=true, stores raw IP for
  // narrowly scoped security investigations. Access must be restricted via RBAC.
  // IPv4: masks last octet (e.g., 192.168.1.123 -> 192.168.1.0)
  // IPv6: truncates to /64 (first 4 hextets), e.g., 2001:db8:85a3:8d3:1319:8a2e:370:7348 -> 2001:db8:85a3:8d3::
  @Column({ nullable: true })
  ipAddress: string | null;

  // Stores a minimal user agent by default. If SECURITY_HASH_UA=true, stores SHA-256 hash
  // of the user agent to avoid persisting the raw string. Access must be restricted via RBAC.
  @Column({ nullable: true })
  userAgent: string | null;

  // Indicates whether the user provided consent to store network and device identifiers.
  // When SECURITY_REQUIRE_CONSENT=true and this is false, ipAddress and userAgent are nulled.
  @Column({ type: 'boolean', default: false })
  consentProvided: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @BeforeInsert()
  private applyPrivacyControls(): void {
    const requireConsent =
      (process.env.SECURITY_REQUIRE_CONSENT || 'true') === 'true';
    const fullIpEnabled = (process.env.SECURITY_FULL_IP || 'false') === 'true';
    const hashUaEnabled = (process.env.SECURITY_HASH_UA || 'true') === 'true';

    // If consent is required and not provided, do not persist these fields
    if (requireConsent && !this.consentProvided) {
      this.ipAddress = null;
      this.userAgent = null;
      return;
    }

    // Process IP address
    if (this.ipAddress && !fullIpEnabled) {
      this.ipAddress = anonymizeIp(this.ipAddress);
    }

    // Process user agent
    if (this.userAgent) {
      if (hashUaEnabled) {
        this.userAgent = hashString(this.userAgent);
      } else {
        this.userAgent = minimalUserAgent(this.userAgent);
      }
    }
  }
}

// IPv4: mask last octet; IPv6: keep first 4 hextets (approx /64), then ::
function anonymizeIp(ip: string): string {
  // Simple detection; does not validate CIDR correctness
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = '0';
      return parts.join('.');
    }
    return ip;
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    const first = parts.slice(0, 4).join(':');
    return first + '::';
  }
  return ip;
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// Keep only a minimal, non-identifying portion (first token and up to 32 chars)
function minimalUserAgent(ua: string): string {
  const token = ua.split(' ')[0] || ua;
  return token.substring(0, 32);
}
