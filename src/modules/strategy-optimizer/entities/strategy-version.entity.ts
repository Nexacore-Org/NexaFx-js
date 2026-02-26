import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Strategy } from './strategy.entity';

@Entity('strategy_versions')
export class StrategyVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  strategyId: string;

  @ManyToOne(() => Strategy, (strategy) => strategy.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategyId' })
  strategy: Strategy;

  @Column()
  version: number;

  @Column('jsonb')
  parameters: Record<string, number>;

  @Column({ nullable: true })
  reason: string;

  @CreateDateColumn()
  createdAt: Date;
}
