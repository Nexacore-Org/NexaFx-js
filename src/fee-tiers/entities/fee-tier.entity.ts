import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type KycFeeLevel = 'basic' | 'intermediate' | 'advanced';

@Entity('fee_tiers')
@Index('idx_fee_tiers_kyc_level', ['kycLevel'])
@Index('idx_fee_tiers_currency', ['currency'])
@Index('idx_fee_tiers_active', ['isActive'])
export class FeeTierEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20 })
  kycLevel: KycFeeLevel;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  tierMin: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  tierMax: number;

  @Column({ type: 'decimal', precision: 5, scale: 4, default: 0 })
  percentageFee: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  flatFee: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
