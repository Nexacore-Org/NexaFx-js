import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

export enum AdminApprovalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('admin_approvals')
export class AdminApproval {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  actionType!: string;

  @Column({ type: 'json' })
  actionData!: any;

  @Column({ type: 'uuid' })
  requestedBy!: string;

  @Column({ type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({
    type: 'enum',
    enum: AdminApprovalStatus,
    default: AdminApprovalStatus.PENDING,
  })
  status!: AdminApprovalStatus;

  @Column({ type: 'uuid', nullable: true })
  rejectedBy?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectionReason?: string | null;

  /** Requests not approved before this moment can no longer be approved. */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  executedAt?: Date | null;

  @CreateDateColumn()
  createdAt!: Date;
}
