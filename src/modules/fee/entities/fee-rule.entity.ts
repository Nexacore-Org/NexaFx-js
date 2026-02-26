import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type FeeRuleType = 'PERCENTAGE' | 'FLAT' | 'TIERED' | 'PROMOTIONAL';

@Entity('fee_rules')
@Index('idx_fee_rules_currency', ['currency'])
@Index('idx_fee_rules_active', ['isActive'])
export class FeeRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50 })
  ruleType: FeeRuleType;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  minAmount?: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  maxAmount?: number;

  /** Percentage value e.g. 1.5 = 1.5% */
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  percentage?: number;

  /** Flat fee in base currency units */
  @Column({ type: 'decimal', precision: 18, scale: 8, nullable: true })
  flatFee?: number;

  /** Lower number = higher priority */
  @Column({ type: 'int', default: 100 })
  priority: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 100, nullable: true })
  promoCode?: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
