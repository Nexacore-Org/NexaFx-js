import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Strategy } from './strategy.entity';

@Entity('performance_metrics')
export class PerformanceMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  strategyId: string;

  @ManyToOne(() => Strategy, (strategy) => strategy.metrics, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategyId' })
  strategy: Strategy;

  @Column('float')
  roi: number;

  @Column('float')
  sharpeRatio: number;

  @Column('float')
  maxDrawdown: number;

  @Column('float')
  volatility: number;

  @Column('float')
  winRate: number;

  @Column({ nullable: true })
  regime: string;

  @CreateDateColumn()
  timestamp: Date;
}
