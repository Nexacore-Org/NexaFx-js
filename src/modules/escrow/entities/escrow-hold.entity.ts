import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum EscrowStatus {
  HELD = 'HELD',
  RELEASED = 'RELEASED',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
}

/** Funds taken from the payer and held until they are released to the payee or refunded. */
@Entity('escrow_holds')
@Index('idx_escrow_holds_payer', ['payerId'])
@Index('idx_escrow_holds_payee', ['payeeId'])
@Index('idx_escrow_holds_status', ['status'])
export class EscrowHold {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  payerId!: string;

  @Column({ type: 'uuid' })
  payeeId!: string;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  amount!: number;

  @Column({ type: 'varchar', length: 10 })
  currency!: string;

  // simple-enum (varchar + check) so the sqlite e2e database can create the table.
  @Column({ type: 'simple-enum', enum: EscrowStatus, default: EscrowStatus.HELD })
  status!: EscrowStatus;

  /** Informational: when the funds are expected to be released. */
  @Column({ type: 'timestamp', nullable: true })
  releaseAfter!: Date | null;

  @CreateDateColumn()
  createdAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt!: Date | null;
}
