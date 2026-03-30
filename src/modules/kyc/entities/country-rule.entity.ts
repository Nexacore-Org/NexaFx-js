import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('country_rules')
export class CountryRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 2, unique: true })
  countryCode: string; // ISO 3166-1 alpha-2

  @Column({ type: 'boolean', default: false })
  isRestricted: boolean;

  @Column({ type: 'boolean', default: false })
  requiresAdvancedKyc: boolean;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  maxTransactionLimit?: number;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
