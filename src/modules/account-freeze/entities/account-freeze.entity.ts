import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('account_freezes')
@Index('idx_account_freezes_user_id', ['userId'])
@Index('idx_account_freezes_is_active', ['isActive'])
@Index('uq_account_freezes_active_user', ['userId'], { unique: true, where: '"isActive" = true' })
export class AccountFreezeEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'varchar', length: 255 })
  frozenBy: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  unfrozenBy?: string;

  @Column({ type: 'timestamp' })
  frozenAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  unfrozenAt?: Date;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
