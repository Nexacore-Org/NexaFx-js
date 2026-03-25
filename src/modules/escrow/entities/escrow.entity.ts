import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EscrowStatus =
  | 'PENDING_RELEASE'
  | 'DISPUTED'
  | 'RELEASED'
  | 'AUTO_RELEASED'
  | 'CANCELLED';

export type EscrowReleaseParty = 'SENDER' | 'BENEFICIARY';

@Entity('escrows')
@Index('idx_escrows_status', ['status'])
@Index('idx_escrows_auto_release_at', ['autoReleaseAt'])
export class EscrowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  senderUserId: string;

  @Column({ type: 'uuid' })
  senderWalletId: string;

  @Column({ type: 'uuid' })
  beneficiaryUserId: string;

  @Column({ type: 'uuid' })
  beneficiaryWalletId: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  amount: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 30, default: 'PENDING_RELEASE' })
  status: EscrowStatus;

  @Column({ type: 'varchar', length: 20 })
  releaseParty: EscrowReleaseParty;

  @Column({ type: 'timestamp', nullable: true })
  autoReleaseAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  releaseCondition?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  @Column({ type: 'uuid', nullable: true })
  lockTransactionId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  releaseTransactionId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  cancellationTransactionId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  disputeId?: string | null;

  @Column({ type: 'uuid', nullable: true })
  releasedByUserId?: string | null;

  @Column({ type: 'timestamp', nullable: true })
  releasedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  disputedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
