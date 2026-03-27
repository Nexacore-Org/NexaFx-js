import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('data_lineage_logs')
export class DataLineage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  jobName: string;

  @Column('simple-array')
  piiFieldsDetected: string[];

  @Column({ default: false })
  anonymizationApplied: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>; // Includes record counts, duration, etc.

  @CreateDateColumn({ update: false })
  timestamp: Date;
}