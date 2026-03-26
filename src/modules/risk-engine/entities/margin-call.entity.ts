import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';

export enum MarginCallStatus {
  PENDING = 'PENDING',
  NOTIFIED = 'NOTIFIED',
  RESOLVED = 'RESOLVED',
  LIQUIDATED = 'LIQUIDATED',
}

@Entity('margin_calls')
export class MarginCall {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  utilizationAtCreation: number;

  @Column({ type: 'enum', enum: MarginCallStatus, default: MarginCallStatus.PENDING })
  status: MarginCallStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}