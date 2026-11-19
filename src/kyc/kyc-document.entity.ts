import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../users/user.entity';

export enum KycDocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  APPEALED = 'appealed',
}

@Entity('kyc_documents')
@Index(['userId'])
@Index(['status'])
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @Column()
  documentType!: string;

  /**
   * AES-256-GCM sealed value `enc:<keyVersion>:<ciphertext>` (issue #1535). Rows written before
   * that change may still hold plaintext until the backfill runs; readers handle both.
   */
  @Column()
  documentNumber!: string;

  /** Keyed hash of the normalised document number, for duplicate detection. */
  @Index('IDX_kyc_documents_documentNumberHash')
  @Column({ type: 'varchar', length: 64, nullable: true })
  documentNumberHash?: string | null;

  @Column()
  documentUrl!: string;

  @Column({
    type: 'enum',
    enum: KycDocumentStatus,
    default: KycDocumentStatus.PENDING,
  })
  status!: KycDocumentStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date;

  @Column({ type: 'text', nullable: true })
  appealReason?: string;

  @CreateDateColumn()
  createdAt!: Date;
}
