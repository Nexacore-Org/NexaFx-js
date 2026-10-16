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

  /** Set when the approved action failed to run (the approval stays PENDING). */
  @Column({ type: 'varchar', length: 500, nullable: true })
  lastError?: string | null;

  // simple-enum (varchar + check) because better-sqlite3 rejects a native enum column.
  @Column({
    type: 'simple-enum',
    enum: AdminApprovalStatus,
    default: AdminApprovalStatus.PENDING,
  })
  status!: AdminApprovalStatus;

  @CreateDateColumn()
  createdAt!: Date;
}
