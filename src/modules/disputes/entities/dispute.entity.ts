import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DisputeSubjectType = 'ESCROW';
export type DisputeStatus = 'OPEN' | 'RESOLVED' | 'CLOSED';

@Entity('disputes')
@Index('idx_disputes_subject', ['subjectType', 'subjectId'])
export class DisputeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  subjectType: DisputeSubjectType;

  @Column({ type: 'uuid' })
  subjectId: string;

  @Column({ type: 'uuid' })
  initiatorUserId: string;

  @Column({ type: 'uuid', nullable: true })
  counterpartyUserId?: string | null;

  @Column({ type: 'varchar', length: 20, default: 'OPEN' })
  status: DisputeStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
