import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
} from 'typeorm';

@Entity('rate_snapshots')
@Index(['pair', 'bucketHour'], { unique: true })
@Index(['pair', 'bucketHour'])
export class RateSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** e.g. "USD/NGN" */
  @Column({ length: 16 })
  pair: string;

  /**
   * Truncated to the hour — the "one row per pair per hour" bucket key.
   * Stored as UTC. e.g. 2025-05-09T14:00:00.000Z
   */
  @Column({ type: 'timestamptz', name: 'bucket_hour' })
  bucketHour: Date;

  // ── OHLC ────────────────────────────────────────────────────────────────

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  open: number;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  high: number;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  low: number;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  close: number;

  // ── Bid / Ask / Spread ───────────────────────────────────────────────────

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  bid: number;

  @Column({ type: 'numeric', precision: 20, scale: 8 })
  ask: number;

  /** Absolute spread: ask - bid */
  @Column({ type: 'numeric', precision: 20, scale: 8 })
  spread: number;

  /** Spread as a fraction of mid, e.g. 0.0012 = 12 bps */
  @Column({ type: 'numeric', precision: 10, scale: 6, name: 'spread_pct' })
  spreadPct: number;

  // ── Provider meta ────────────────────────────────────────────────────────

  /** Number of provider samples that contributed to this bucket */
  @Column({ type: 'int', default: 0, name: 'sample_count' })
  sampleCount: number;

  /**
   * Weighted confidence score across contributing providers (0–1).
   * Averaged from per-provider confidence at snapshot time.
   */
  @Column({
    type: 'numeric',
    precision: 5,
    scale: 4,
    name: 'confidence_score',
    default: 0,
  })
  confidenceScore: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
