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

  @Column()
  documentNumber!: string;

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
