import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum KycDocumentStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('kyc_documents')
@Index(['userId'])
@Index(['status'])
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

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

  @CreateDateColumn()
  createdAt!: Date;
}
