import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToOne, JoinColumn } from 'typeorm';
import { Transaction } from './transaction.entity';

@Entity('transaction_features')
export class TransactionFeatures {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  transactionId: string;

  @Column({ default: '1.0.0' })
  schemaVersion: string;

  @Column('jsonb')
  vector: {
    amount: number;
    hourOfDay: number;
    dayOfWeek: number;
    geoDistance: number; // Distance from last tx in km
    deviceAgeDays: number;
    isNewDevice: boolean;
  };

  @CreateDateColumn()
  createdAt: Date;
}