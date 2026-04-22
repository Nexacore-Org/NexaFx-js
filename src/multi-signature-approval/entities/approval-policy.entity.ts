import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('approval_policies')
export class ApprovalPolicy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  transactionType: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  minAmount: number | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  maxAmount: number | null;

  @Column({ type: 'simple-array', nullable: true })
  requiredApprovers: string[]; // userIds or roles

  @Column({ type: 'int', default: 1 })
  quorumCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'jsonb', nullable: true })
  auditLog: Array<{
    changedBy: string;
    changedAt: string;
    oldConfig: Record<string, any>;
    newConfig: Record<string, any>;
  }>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
