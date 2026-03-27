import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export type AmlRuleType =
  | 'STRUCTURING'
  | 'SMURFING'
  | 'VELOCITY_BURST'
  | 'CROSS_BORDER_THRESHOLD';

@Entity('aml_rules')
@Index('idx_aml_rules_type', ['ruleType'])
@Index('idx_aml_rules_enabled', ['enabled'])
export class AmlRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  ruleType: AmlRuleType;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** Configurable thresholds stored as JSONB for flexibility */
  @Column({ type: 'jsonb' })
  thresholds: Record<string, number>;

  /** Risk score weight added to a transaction when this rule fires */
  @Column({ type: 'int', default: 30 })
  riskScoreWeight: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
