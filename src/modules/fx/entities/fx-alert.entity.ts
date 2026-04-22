import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('fx_alerts')
export class FxAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  currencyPair: string; // e.g. USD/NGN

  @Column('decimal')
  threshold: number;

  @Column({ type: 'enum', enum: ['above', 'below'] })
  direction: 'above' | 'below';

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  // Recurring fields
  @Column({ type: 'boolean', default: false })
  isRecurring: boolean;

  @Column({ type: 'int', nullable: true })
  maxTriggers: number | null; // null = unlimited

  @Column({ type: 'int', default: 0 })
  triggerCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
