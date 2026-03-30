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

@Entity('forward_contracts')
@Index(['userId', 'status'])
@Index(['baseCurrency', 'quoteCurrency', 'status'])
export class ForwardContract {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** e.g. "USD" */
  @Column({ length: 10 })
  baseCurrency: string;

  /** e.g. "NGN" */
  @Column({ length: 10 })
  quoteCurrency: string;

  /**
   * The exchange rate locked at booking time.
   * This field is IMMUTABLE after creation — never updated.
   */
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  lockedRate: number;

  /** Notional amount in base currency */
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  notionalAmount: number;

  /** Amount of collateral blocked at booking time */
  @Column({ type: 'decimal', precision: 20, scale: 8 })
  collateralAmount: number;

  /** Currency in which collateral is held */
  @Column({ length: 10 })
  collateralCurrency: string;

  /** Date on which automatic settlement executes */
  @Column({ type: 'timestamptz' })
  maturityDate: Date;

  @Column({
    type: 'enum',
    enum: ForwardContractStatus,
    default: ForwardContractStatus.ACTIVE,
  })
  status: ForwardContractStatus;

  /** Cancellation fee charged when the contract is cancelled early */
  @Column({ type: 'decimal', precision: 20, scale: 8, default: 0 })
  cancellationFeeCharged: number;

  /** Effective settlement rate (equals lockedRate for maturity, 0 if cancelled) */
  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  settlementRate: number | null;

  /** When the contract was settled or cancelled */
  @Column({ type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
