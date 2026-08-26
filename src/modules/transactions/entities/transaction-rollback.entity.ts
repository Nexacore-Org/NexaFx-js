import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('transaction_rollbacks')
@Index('idx_transaction_rollbacks_original', ['originalTransactionId'], { unique: true })
export class TransactionRollbackEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  originalTransactionId: string;

  @Column({ type: 'uuid' })
  rollbackTransactionId: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ type: 'uuid' })
  rolledBackBy: string;

  @CreateDateColumn()
  rolledBackAt: Date;
}
