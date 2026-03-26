import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('risk_states')
@Index(['userId'], { unique: true })
export class RiskState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  userId: string;

  // ── Daily loss tracking ───────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 0 })
  dailyLoss: number;

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 1000 })
  dailyLossLimit: number;

  // ── Circuit breaker ───────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: false })
  circuitBreakerActive: boolean;

  // ── Position limits ───────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 18, scale: 8, default: 10000 })
  maxPositionSize: number;

  @Column({ type: 'int', default: 10 })
  maxOpenPositions: number;

  @Column({ type: 'int', default: 0 })
  openPositions: number;

  // ── Meta ──────────────────────────────────────────────────────────────────

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastRefreshedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastResetAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}