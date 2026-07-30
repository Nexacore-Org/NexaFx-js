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

  @CreateDateColumn()
  createdAt!: Date;
}
