import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum ForwardContractStatus {
  ACTIVE = 'ACTIVE',
  SETTLED = 'SETTLED',
  CANCELLED = 'CANCELLED',
}

@Entity('fx_forward_contracts')
@Index(['userId', 'status'])
@Index(['baseCurrency', 'quoteCurrency', 'status'])
export class FxForwardContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 10 })
  baseCurrency: string;

  @Column({ length: 10 })
  quoteCurrency: string;

  /** Rate locked at booking — immutable after creation */
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  lockedRate: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  notionalAmount: number;

  @Column({ type: 'decimal', precision: 20, scale: 8 })
  collateralAmount: number;

  @Column({ length: 10 })
  collateralCurrency: string;

  @Column({ type: 'timestamptz' })
  maturityDate: Date;

  @Column({ type: 'enum', enum: ForwardContractStatus, default: ForwardContractStatus.ACTIVE })
  status: ForwardContractStatus;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  cancellationFeeCharged: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  settlementRate: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
