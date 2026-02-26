import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { RiskState } from './risk-state.entity';

@Entity('risk_positions')
export class RiskPosition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  symbol: string;

  @Column('decimal', { precision: 18, scale: 8 })
  quantity: number;

  @Column('decimal', { precision: 18, scale: 8 })
  entryPrice: number;

  @Column('decimal', { precision: 18, scale: 8 })
  currentPrice: number;

  @Column('int')
  leverage: number;

  @Column({ type: 'varchar', length: 10 })
  side: 'BUY' | 'SELL';

  @Column({ type: 'varchar', length: 20 })
  assetType: 'FOREX' | 'CRYPTO' | 'STOCK';

  @ManyToOne(() => RiskState, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId', referencedColumnName: 'userId' })
  riskState: RiskState;
}
