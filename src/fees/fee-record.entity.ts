import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('fee_records')
@Index(['transactionId'])
@Index(['userId'])
export class FeeRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  transactionId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 20 })
  transactionType: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  feeAmount: number;

  @Column({ length: 10 })
  currency: string;

  @Column({ length: 50, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
