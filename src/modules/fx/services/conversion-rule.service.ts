import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ConversionRule } from './conversion-rule.entity';

@Entity('rule_execution_history')
export class RuleExecutionHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => ConversionRule, (rule) => rule.executionHistory, {
    onDelete: 'CASCADE',
  })
  rule: ConversionRule;

  @Column()
  fromCurrency: string;

  @Column()
  toCurrency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount: number;

  @Column()
  idempotencyKey: string;

  @Column({ default: 'SUCCESS' })
  status: string;

  @CreateDateColumn()
  executedAt: Date;
}
