import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EscrowService } from '../services/escrow.service';

@Injectable()
export class AutoReleaseJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoReleaseJob.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly escrowService: EscrowService) {}

  async onModuleInit(): Promise<void> {
    const escrows = await this.escrowService.findSchedulableEscrows();
    await Promise.all(escrows.map((escrow) => this.schedule(escrow.id, escrow.autoReleaseAt!)));
  }

  onModuleDestroy(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  async schedule(escrowId: string, autoReleaseAt: Date): Promise<void> {
    this.cancel(escrowId);

    const delayMs = autoReleaseAt.getTime() - Date.now();
    if (delayMs <= 0) {
      await this.triggerAutoRelease(escrowId);
      return;
    }

    const timer = setTimeout(() => {
      void this.triggerAutoRelease(escrowId);
    }, delayMs);

    this.timers.set(escrowId, timer);
    this.logger.debug(`Scheduled auto-release for escrow ${escrowId} at ${autoReleaseAt.toISOString()}`);
  }

  cancel(escrowId: string): void {
    const timer = this.timers.get(escrowId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.timers.delete(escrowId);
  }

  private async triggerAutoRelease(escrowId: string): Promise<void> {
    this.timers.delete(escrowId);

    try {
      await this.escrowService.processAutoRelease(escrowId);
    } catch (error) {
      this.logger.error(`Auto-release failed for escrow ${escrowId}`, error instanceof Error ? error.stack : undefined);
    }
  }
}
