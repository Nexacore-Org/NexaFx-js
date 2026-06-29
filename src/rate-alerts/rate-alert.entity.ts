import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('rate_alerts')
@Index(['userId'])
@Index(['currencyPair'])
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

  @CreateDateColumn()
  createdAt: Date;
}
