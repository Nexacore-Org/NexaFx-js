import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type KycStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type KycDocType = 'PASSPORT' | 'NATIONAL_ID' | 'DRIVERS_LICENSE' | 'UTILITY_BILL';
export type KycLevel = 'NONE' | 'BASIC' | 'ADVANCED';

@Entity('kyc_documents')
export class KycDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  docType: KycDocType;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: KycStatus;

  @Column({ type: 'varchar', length: 20, default: 'BASIC' })
  kycLevel: KycLevel;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
