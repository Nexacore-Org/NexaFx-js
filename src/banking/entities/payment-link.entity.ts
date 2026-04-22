import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('payment_links')
export class PaymentLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 12 })
  @Index()
  code: string;

  @Column({ name: 'owner_id' })
  ownerId: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  amount: string | null;

  @Column({ nullable: true })
  currency: string;

  @Column({ nullable: true })
  description: string;

  @Column({ name: 'max_uses', nullable: true, type: 'int' })
  maxUses: number | null;

  @Column({ name: 'use_count', default: 0 })
  useCount: number;

  @Column({ name: 'view_count', default: 0 })
  viewCount: number;

  @Column({ name: 'expires_at', nullable: true, type: 'timestamptz' })
  expiresAt: Date | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
