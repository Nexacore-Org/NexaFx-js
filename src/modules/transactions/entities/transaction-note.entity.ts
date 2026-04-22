import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { TransactionEntity } from './transaction.entity';

@Entity('transaction_notes')
@Index('idx_transaction_notes_transaction_id', ['transactionId'])
@Index('idx_transaction_notes_user_id', ['userId'])
@Index('idx_transaction_notes_created_at', ['createdAt'])
export class TransactionNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'tsvector', nullable: true })
  searchVector?: any;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
