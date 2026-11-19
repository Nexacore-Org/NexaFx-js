import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rate_alert_history')
@Index('IDX_rate_alert_history_user_created', ['userId', 'createdAt'])
@Index('IDX_rate_alert_history_alert', ['alertId'])
@Index('IDX_rate_alert_history_currency_pair_created', [
  'currencyPair',
  'createdAt',
])
export class RateAlertHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  alertId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ length: 20 })
  currencyPair: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  triggeredRate: number;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  targetRate: number;

  @Column({ type: 'varchar', length: 10 })
  direction: string;

  @CreateDateColumn()
  createdAt: Date;
}
