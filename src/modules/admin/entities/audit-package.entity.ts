import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum AuditPackageStatus {
  PENDING = 'PENDING',
  GENERATING = 'GENERATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Entity('audit_packages')
export class AuditPackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuditPackageStatus, default: AuditPackageStatus.PENDING })
  status: AuditPackageStatus;

  @Column({ nullable: true })
  downloadUrl: string | null;

  @Column({ nullable: true })
  sha256Manifest: string | null;

  @Column({ nullable: true })
  triggeredBy: string; // 'manual' | 'scheduled' | userId

  @Column({ type: 'jsonb', nullable: true })
  summary: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
