import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerStatus {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly circuits = new Map<string, CircuitBreakerStatus>();

  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;

  constructor(private readonly configService: ConfigService) {
    this.failureThreshold = this.configService.get<number>(
      'CIRCUIT_BREAKER_FAILURE_THRESHOLD',
      5,
    );
    this.recoveryTimeout = this.configService.get<number>(
      'CIRCUIT_BREAKER_RECOVERY_TIMEOUT',
      60000,
    );
  }

  private getOrCreate(provider: string): CircuitBreakerStatus {
    if (!this.circuits.has(provider)) {
      this.circuits.set(provider, {
        state: CircuitState.CLOSED,
        failureCount: 0,
        lastFailureTime: null,
        nextAttemptTime: null,
      });
    }
    return this.circuits.get(provider)!;
  }

  isAvailable(provider: string): boolean {
    const circuit = this.getOrCreate(provider);

    if (circuit.state === CircuitState.CLOSED) {
      return true;
    }

    if (circuit.state === CircuitState.OPEN) {
      const now = Date.now();
      if (circuit.nextAttemptTime && now >= circuit.nextAttemptTime) {
        // Transition to HALF_OPEN to allow a probe request
        circuit.state = CircuitState.HALF_OPEN;
        this.circuits.set(provider, circuit);
        this.logger.log(`Circuit for ${provider} transitioned to HALF_OPEN`);
        return true;
      }
      return false;
    }

    // HALF_OPEN: allow one probe
    return true;
  }

  recordSuccess(provider: string): void {
    const circuit = this.getOrCreate(provider);

    if (circuit.state === CircuitState.HALF_OPEN) {
      this.logger.log(`Circuit for ${provider} recovered — transitioning to CLOSED`);
    }

    circuit.state = CircuitState.CLOSED;
    circuit.failureCount = 0;
    circuit.lastFailureTime = null;
    circuit.nextAttemptTime = null;
    this.circuits.set(provider, circuit);
  }

  recordFailure(provider: string): void {
    const circuit = this.getOrCreate(provider);
    circuit.failureCount += 1;
    circuit.lastFailureTime = Date.now();

    if (
      circuit.state === CircuitState.HALF_OPEN ||
      circuit.failureCount >= this.failureThreshold
    ) {
      circuit.state = CircuitState.OPEN;
      circuit.nextAttemptTime = Date.now() + this.recoveryTimeout;
      this.logger.warn(
        `Circuit for ${provider} OPENED after ${circuit.failureCount} failures. ` +
          `Next attempt at ${new Date(circuit.nextAttemptTime).toISOString()}`,
      );
    }

    this.circuits.set(provider, circuit);
  }

  getStatus(provider: string): CircuitBreakerStatus {
    return { ...this.getOrCreate(provider) };
  }

  /** For testing: reset a specific circuit */
  reset(provider: string): void {
    this.circuits.set(provider, {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailureTime: null,
      nextAttemptTime: null,
    });
  }
}
