import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from 'typeorm';
import { Strategy } from './strategy.entity';

@Entity('strategy_parameters')
export class StrategyParameter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  strategyId: string;

  @ManyToOne(() => Strategy, (strategy) => strategy.parameters, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'strategyId' })
  strategy: Strategy;

  @Column()
  key: string;

  @Column('float')
  value: number;

  @Column('float')
  min: number;

  @Column('float')
  max: number;

  @Column('float')
  step: number;

  @Column({ nullable: true })
  description: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
