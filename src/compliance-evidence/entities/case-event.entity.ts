import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ComplianceCase } from './compliance-case.entity';

export enum EventType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  NOTE_ADDED = 'NOTE_ADDED',
  ASSIGNED = 'ASSIGNED',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
}

@Entity('case_events')
export class CaseEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: EventType })
  eventType: EventType;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any>;

  @ManyToOne(() => ComplianceCase, (complianceCase) => complianceCase.events)
  @JoinColumn({ name: 'caseId' })
  complianceCase: ComplianceCase;

  @Column()
  caseId: string;

  // Enforcing immutability at the ORM level
  @CreateDateColumn({ update: false })
  createdAt: Date;
}