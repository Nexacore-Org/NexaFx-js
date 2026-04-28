import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { RuleExecutionHistory } from './rule-execution-history.entity';

export enum ConversionRuleTriggerType {
  ON_RECEIVE = 'ON_RECEIVE',
  BALANCE_THRESHOLD = 'BALANCE_THRESHOLD',
  RATE_THRESHOLD = 'RATE_THRESHOLD',
}

@Entity('conversion_rules')
export class ConversionRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.id, { onDelete: 'CASCADE' })
  user: User;

  @Column({
    type: 'enum',
    enum: ConversionRuleTriggerType,
  })
  triggerType: ConversionRuleTriggerType;

  @Column()
  fromCurrency: string;

  @Column()
  toCurrency: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  thresholdValue?: number;

  @Column({ type: 'decimal', precision: 18, scale: 4, nullable: true })
  rateValue?: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => RuleExecutionHistory, (history) => history.rule)
  executionHistory: RuleExecutionHistory[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
