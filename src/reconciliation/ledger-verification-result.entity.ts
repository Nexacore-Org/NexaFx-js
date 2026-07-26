import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ledger_verification_results')
@Index(['ranAt'])
export class LedgerVerificationResult {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn()
  ranAt!: Date;

  @Column({ type: 'int', default: 0 })
  totalChecked!: number;

  @Column({ type: 'int', default: 0 })
  discrepancyCount!: number;

  @Column({ type: 'jsonb', nullable: true })
  discrepancies!: Record<string, unknown>[] | null;
}
