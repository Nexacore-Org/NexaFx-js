import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

const FAILURE_THRESHOLD = 5;
const RESET_TIMEOUT = 30000; // 30s

@Injectable()
export class CircuitBreakerService {
  constructor(private readonly redis: Redis) {}

  private key(name: string) {
    return `circuit:${name}`;
  }

  async getState(name: string) {
    const data = await this.redis.get(this.key(name));
    return data ? JSON.parse(data) : null;
  }

  async setState(name: string, state: any) {
    await this.redis.set(this.key(name), JSON.stringify(state));
  }

  async canExecute(name: string): Promise<boolean> {
    const circuit = await this.getState(name);

    if (!circuit) return true;

    // manual override
    if (circuit.manualOverride === 'OPEN') return false;

    if (circuit.state === 'OPEN') {
      const now = Date.now();

      if (now - circuit.lastFailureTime > RESET_TIMEOUT) {
        // move to HALF_OPEN atomically
        await this.setState(name, {
          ...circuit,
          state: 'HALF_OPEN',
        });
        return true;
      }

      return false;
    }

    if (circuit.state === 'HALF_OPEN') {
      // allow only 1 probe → handled via lock
      return await this.acquireProbeLock(name);
    }

    return true;
  }

  async onSuccess(name: string) {
    await this.setState(name, {
      state: 'CLOSED',
      failureCount: 0,
      manualOverride: null,
    });
  }

  async onFailure(name: string) {
    const circuit = (await this.getState(name)) || {
      state: 'CLOSED',
      failureCount: 0,
    };

    const failureCount = circuit.failureCount + 1;

    if (failureCount >= FAILURE_THRESHOLD) {
      await this.setState(name, {
        state: 'OPEN',
        failureCount,
        lastFailureTime: Date.now(),
        manualOverride: circuit.manualOverride || null,
      });
    } else {
      await this.setState(name, {
        ...circuit,
        failureCount,
      });
    }
  }

  async acquireProbeLock(name: string): Promise<boolean> {
    const key = `circuit:${name}:probe`;

    const result = await this.redis.set(key, '1', 'NX', 'EX', 10);
    return result === 'OK';
  }

  async manualOpen(name: string) {
    await this.setState(name, {
      state: 'OPEN',
      failureCount: FAILURE_THRESHOLD,
      manualOverride: 'OPEN',
      lastFailureTime: Date.now(),
    });
  }

  async getAll() {
    const keys = await this.redis.keys('circuit:*');
    const result = {};

    for (const key of keys) {
      if (key.includes(':probe')) continue;
      result[key.replace('circuit:', '')] = JSON.parse(
        (await this.redis.get(key)) || '{}',
      );
    }

    return result;
  }
}