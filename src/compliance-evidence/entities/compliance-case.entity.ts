import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { CaseEvent } from './case-event.entity';

export enum CaseStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
}

@Entity('compliance_cases')
export class ComplianceCase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: CaseStatus, default: CaseStatus.OPEN })
  status: CaseStatus;

  @Column({ nullable: true })
  assignedTo: string;

  @Column({ nullable: true })
  resolutionType: string;

  @Column({ type: 'text', nullable: true })
  resolutionSummary: string;

  @OneToMany(() => CaseEvent, (event) => event.complianceCase, { cascade: true })
  events: CaseEvent[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}