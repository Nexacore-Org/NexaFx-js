import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('abuse_events')
export class AbuseEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'canary_triggered' })
  pattern: string;

  @Column('jsonb')
  metadata: any;

  @CreateDateColumn()
  createdAt: Date;
}