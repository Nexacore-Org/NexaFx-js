import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum TargetOrderStatus {
  PENDING = 'PENDING',
  EXECUTED = 'EXECUTED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

@Entity('fx_target_orders')
export class FxTargetOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  currencyPair: string; // e.g. USD/NGN

  @Column('decimal', { precision: 20, scale: 8 })
  targetRate: number;

  @Column('decimal', { precision: 20, scale: 8 })
  amount: number;

  @Column({ type: 'enum', enum: ['above', 'below'] })
  direction: 'above' | 'below'; // execute when rate goes above/below target

  @Column({ type: 'enum', enum: TargetOrderStatus, default: TargetOrderStatus.PENDING })
  status: TargetOrderStatus;

  @Column({ nullable: true })
  idempotencyKey: string;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  executedRate: number | null;

  @Column({ type: 'timestamp', nullable: true })
  executedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
