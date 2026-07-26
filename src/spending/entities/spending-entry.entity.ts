import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { SpendingCategoryEntity } from './spending-category.entity';

@Entity('spending_entries')
@Index('idx_spending_entries_user_id', ['userId'])
@Index('idx_spending_entries_date', ['date'])
@Index('idx_spending_entries_user_date', ['userId', 'date'])
export class SpendingEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId?: string;

  @Column({ type: 'uuid', nullable: true })
  categoryId?: string;

  @ManyToOne(() => SpendingCategoryEntity, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'categoryId' })
  category?: SpendingCategoryEntity;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description?: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
