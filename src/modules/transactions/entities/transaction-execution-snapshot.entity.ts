import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TransactionEntity } from './transaction.entity';

@Entity('transaction_execution_snapshots')
export class TransactionExecutionSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  transaction: TransactionEntity;

  @Column({ type: 'varchar', length: 50 })
  status: 'SUCCESS' | 'FAILED';

  @Column({ type: 'int', nullable: true })
  durationMs?: number;

  @Column({ type: 'jsonb' })
  metadata: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  logs?: Record<string, any>;

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'text', nullable: true })
  errorStack?: string;

  @CreateDateColumn()
  createdAt: Date;
}
