import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('dead_letter_jobs')
@Index('idx_dlj_original_queue', ['originalQueue'])
@Index('idx_dlj_created_at', ['createdAt'])
export class DeadLetterJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  originalQueue: string;

  @Column({ type: 'varchar', length: 100 })
  originalJobName: string;

  @Column({ type: 'jsonb', nullable: true })
  originalJobData: unknown;

  @Column({ type: 'text' })
  failureReason: string;

  @Column({ type: 'varchar', length: 100 })
  idempotencyKey: string;

  @Column({ type: 'int' })
  attemptsMade: number;

  @Column({ type: 'timestamptz' })
  failedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
