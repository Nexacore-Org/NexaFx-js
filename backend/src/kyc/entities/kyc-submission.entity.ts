import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { KycDocument } from './kyc-document.entity';

export enum KycStatus {
  NOT_STARTED = 'not_started',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  ADDITIONAL_INFO_REQUIRED = 'additional_info_required',
}

export enum KycTier {
  TIER_0 = 0, // Not verified
  TIER_1 = 1, // BVN/NIN Verified
  TIER_2 = 2, // ID Document Verified
  TIER_3 = 3, // Address Verified
}

@Entity('kyc_submissions')
export class KycSubmission {
  @PrimaryColumn('uuid')
  userId: string;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.NOT_STARTED })
  status: KycStatus;

  @Column({ type: 'enum', enum: KycTier, default: KycTier.TIER_0 })
  tier: KycTier;

  @Column({ nullable: true })
  bvn?: string;

  @Column({ nullable: true })
  nin?: string;

  @Column({ nullable: true })
  rejectionReason?: string;
  
  @OneToMany(() => KycDocument, (doc) => doc.submission)
  documents: KycDocument[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}