import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('rate_alerts')
@Index(['userId'])
@Index(['currencyPair'])
@Index(['userId', 'isActive'])
@Index(['currencyPair', 'triggered', 'isActive'])
@Index('IDX_rate_alerts_user', ['userId'])
@Index('IDX_rate_alerts_currency_pair', ['currencyPair'])
export class RateAlertEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column()
  currencyPair: string;

  @Column({ type: 'decimal', precision: 18, scale: 8 })
  targetRate: number;

  @Column({ type: 'varchar', length: 10 })
  direction: 'above' | 'below';

  @Column({ default: false })
  triggered: boolean;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  triggeredAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
