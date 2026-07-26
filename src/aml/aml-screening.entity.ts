import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AmlRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

@Entity('aml_screenings')
@Index(['userId'])
@Index(['transactionId'])
@Index(['riskLevel'])
@Index(['screenedAt'])
export class AmlScreening {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'uuid', nullable: true })
  transactionId!: string | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  riskScore!: number;

  @Column({ type: 'simple-enum', enum: AmlRiskLevel, default: AmlRiskLevel.LOW })
  riskLevel!: AmlRiskLevel;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  flags!: string[];

  @CreateDateColumn()
  screenedAt!: Date;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;
}
