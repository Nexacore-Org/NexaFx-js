import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',     // healthy
  OPEN = 'OPEN',         // failing, requests blocked
  HALF_OPEN = 'HALF_OPEN', // recovery probe
}

export enum ProviderStatus {
  HEALTHY = 'HEALTHY',
  DEGRADED = 'DEGRADED',
  DOWN = 'DOWN',
}

@Entity('provider_health_metrics')
@Index(['providerName'], { unique: true })
export class ProviderHealthMetric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'provider_name', length: 64 })
  providerName: string;

  /** Rolling 1-hour request count */
  @Column({ type: 'int', default: 0, name: 'request_count_1h' })
  requestCount1h: number;

  /** Rolling 1-hour error count */
  @Column({ type: 'int', default: 0, name: 'error_count_1h' })
  errorCount1h: number;

  /** Cumulative total requests since first seen */
  @Column({ type: 'bigint', default: 0, name: 'total_requests' })
  totalRequests: number;

  /** Cumulative total errors */
  @Column({ type: 'bigint', default: 0, name: 'total_errors' })
  totalErrors: number;

  /** Milliseconds — exponential moving average latency */
  @Column({ type: 'numeric', precision: 10, scale: 2, default: 0, name: 'avg_latency_ms' })
  avgLatencyMs: number;

  @Column({
    type: 'enum',
    enum: CircuitBreakerState,
    default: CircuitBreakerState.CLOSED,
    name: 'circuit_breaker_state',
  })
  circuitBreakerState: CircuitBreakerState;

  /** ISO timestamp of when the circuit was last tripped */
  @Column({ type: 'timestamptz', nullable: true, name: 'last_tripped_at' })
  lastTrippedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_success_at' })
  lastSuccessAt: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
