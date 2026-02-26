// src/common/clock/clock.interface.ts
export interface IClock {
  now(): number;
  isoString(): string;
}

// src/common/clock/clock.service.ts
import { Injectable, Scope } from '@nestjs/common';
import { IClock } from './clock.interface';

@Injectable({ scope: Scope.DEFAULT })
export class ClockService implements IClock {
  private manualTime: number | null = null;

  // In live mode, returns real time. In replay mode, returns the set time.
  now(): number {
    return this.manualTime ?? Date.now();
  }

  isoString(): string {
    return new Date(this.now()).toISOString();
  }

  // Used by the Replay Engine to "tick" the clock forward
  setSystemTime(time: number) {
    this.manualTime = time;
  }

  reset() {
    this.manualTime = null;
  }
}