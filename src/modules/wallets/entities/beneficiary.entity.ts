import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('beneficiaries')
@Index('idx_beneficiaries_user_id', ['userId'])
@Index('idx_beneficiaries_user_address', ['userId', 'address'], { unique: true })
export class BeneficiaryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  address: string;

  @Column({ type: 'varchar', length: 100 })
  alias: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  /** True when address was edited and re-verification is pending */
  @Column({ type: 'boolean', default: false })
  requiresVerification: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
