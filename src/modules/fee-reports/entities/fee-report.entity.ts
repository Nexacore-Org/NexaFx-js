import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type FeeReportPeriod = 'daily' | 'weekly' | 'monthly';

@Entity('fee_reports')
@Index('idx_fee_reports_user_id', ['userId'])
@Index('idx_fee_reports_period', ['period'])
@Index('idx_fee_reports_generated_at', ['generatedAt'])
export class FeeReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 20 })
  period: FeeReportPeriod;

  @Column({ type: 'timestamp' })
  startDate: Date;

  @Column({ type: 'timestamp' })
  endDate: Date;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  totalFees: number;

  @Column({ type: 'jsonb', default: {} })
  feeBreakdown: Record<string, number>;

  @Column({ type: 'timestamp' })
  generatedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
