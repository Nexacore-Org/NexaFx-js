import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StrategyParameter } from './strategy-parameter.entity';
import { StrategyVersion } from './strategy-version.entity';
import { PerformanceMetric } from './performance-metric.entity';

@Entity('strategies')
export class Strategy {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => StrategyParameter, (param) => param.strategy, {
    cascade: true,
  })
  parameters: StrategyParameter[];

  @OneToMany(() => StrategyVersion, (version) => version.strategy)
  versions: StrategyVersion[];

  @OneToMany(() => PerformanceMetric, (metric) => metric.strategy)
  metrics: PerformanceMetric[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
