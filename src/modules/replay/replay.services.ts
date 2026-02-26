// src/modules/replay/replay.service.ts
import { Injectable } from '@nestjs/common';
import { ClockService } from '../../common/clock/clock.service';
import { StrategyService } from '../strategy/strategy.service';

@Injectable()
export class ReplayService {
  constructor(
    private clock: ClockService,
    private strategy: StrategyService,
  ) {}

  async replaySession(events: any[]) {
    for (const event of events) {
      // 1. Move the "Virtual Clock" to the event's original time
      this.clock.setSystemTime(event.timestamp);

      // 2. Re-inject the event into the strategy
      const replayResult = await this.strategy.processEvent(event.payload);

      // 3. Checksum Validation (Verification of Determinism)
      if (JSON.stringify(replayResult) !== JSON.stringify(event.result)) {
        throw new Error(`Non-deterministic drift detected at timestamp ${event.timestamp}`);
      }
    }
    this.clock.reset();
    return { status: 'Replay Successful', integrity: '100%' };
  }
}