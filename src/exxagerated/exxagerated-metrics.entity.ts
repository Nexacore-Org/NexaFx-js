import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum AggregationPeriodEnum {
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

@Entity('aggregated_transaction_metrics')
@Index(['periodStart', 'periodEnd', 'periodType'])
export class AggregatedTransactionMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'timestamp' })
  periodEnd: Date;

  @Column({
    type: 'enum',
    enum: AggregationPeriodEnum,
  })
  periodType: AggregationPeriodEnum;

  @Column({ type: 'bigint', default: 0 })
  totalCount: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  totalVolume: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  averageValue: number;

  @Column({ type: 'bigint', default: 0 })
  successfulCount: number;

  @Column({ type: 'bigint', default: 0 })
  failedCount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  successRate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Retention policy timestamp
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}

@Entity('aggregated_user_metrics')
@Index(['periodStart', 'periodEnd', 'periodType'])
export class AggregatedUserMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'timestamp' })
  periodEnd: Date;

  @Column({
    type: 'enum',
    enum: AggregationPeriodEnum,
  })
  periodType: AggregationPeriodEnum;

  // Anonymized count - no user identifiers stored
  @Column({ type: 'bigint', default: 0 })
  activeUsersCount: number;

  @Column({ type: 'bigint', default: 0 })
  newUsersCount: number;

  @Column({ type: 'bigint', default: 0 })
  returningUsersCount: number;

  @Column({ type: 'bigint', default: 0 })
  averageSessionDuration: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  retentionRate: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}

@Entity('aggregated_revenue_metrics')
@Index(['periodStart', 'periodEnd', 'periodType'])
export class AggregatedRevenueMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'timestamp' })
  periodEnd: Date;

  @Column({
    type: 'enum',
    enum: AggregationPeriodEnum,
  })
  periodType: AggregationPeriodEnum;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  totalRevenue: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  averageRevenuePerUser: number;

  @Column({ type: 'decimal', precision: 20, scale: 2, default: 0 })
  totalFees: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date;
}

@Entity('aggregation_jobs')
export class AggregationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AggregationPeriodEnum,
  })
  periodType: AggregationPeriodEnum;

  @Column({ type: 'timestamp' })
  periodStart: Date;

  @Column({ type: 'timestamp' })
  periodEnd: Date;

  @Column({ type: 'varchar', length: 50 })
  status: 'pending' | 'processing' | 'completed' | 'failed';

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}