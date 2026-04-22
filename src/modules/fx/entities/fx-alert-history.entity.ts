import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fx_alert_history')
export class FxAlertHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  alertId: string;

  @Column()
  userId: string;

  @Column()
  currencyPair: string;

  @Column('decimal')
  rateAtTrigger: number;

  @Column('decimal')
  threshold: number;

  @Column({ type: 'enum', enum: ['above', 'below'] })
  direction: 'above' | 'below';

  @CreateDateColumn()
  triggerTime: Date;
}
