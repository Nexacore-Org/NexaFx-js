import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { KycSubmission } from './kyc-submission.entity';

export enum DocumentType {
  NATIONAL_ID = 'national_id',
  DRIVERS_LICENSE = 'drivers_license',
  PASSPORT = 'passport',
  UTILITY_BILL = 'utility_bill',
  SELFIE = 'selfie',
}

@Entity('kyc_documents')
export class KycDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => KycSubmission, (submission) => submission.documents)
  @JoinColumn({ name: 'userId' })
  submission: KycSubmission;

  @Column({ type: 'enum', enum: DocumentType })
  type: DocumentType;

  @Column()
  fileUrl: string; // This would be an S3 URL in production
}