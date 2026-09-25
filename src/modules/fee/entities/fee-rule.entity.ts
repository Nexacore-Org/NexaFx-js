// FeeRuleEntity for the rule-based/promotional fee engine (issue #1272).
// Starting point — fee-rules-admin.service.ts, the admin/simulation
// controllers, and simulate-fee.dto.ts are separate follow-ups.
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('fee_rules')
@Index('idx_fee_rules_currency', ['currency'])
@Index('idx_fee_rules_active', ['isActive'])
export class FeeRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'int', comment: 'Basis points, e.g. 150 = 1.5%' })
  feeBps: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
