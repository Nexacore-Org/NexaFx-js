import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from './user.entity';

@Entity('wallets')
@Index('idx_wallets_public_key', ['publicKey'], { unique: true }) // Unique constraint on public key
@Index('idx_wallets_user_id', ['userId'])
@Index('idx_wallets_status', ['status'])
export class WalletEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255, unique: true }) // Unique constraint enforced at DB level
  publicKey: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, default: 'active' })
  status: 'active' | 'inactive' | 'suspended' | 'deleted';

  @Column({ type: 'varchar', length: 50, default: 'crypto' }) // crypto, fiat, etc.
  type: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn() // Soft delete column
  deletedAt?: Date;

  // Relationship (optional - we store userId as a string for referential integrity)
  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;
}