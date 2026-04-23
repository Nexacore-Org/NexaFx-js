import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { TransactionEntity } from './transaction.entity';

@Entity('transaction_tags')
@Unique(['transactionId', 'userId', 'tag'])
@Index('idx_transaction_tags_transaction_id', ['transactionId'])
@Index('idx_transaction_tags_user_id', ['userId'])
@Index('idx_transaction_tags_tag', ['tag'])
@Index('idx_transaction_tags_user_tag', ['userId', 'tag'])
export class TransactionTagEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @ManyToOne(() => TransactionEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transactionId' })
  transaction: TransactionEntity;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  tag: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
