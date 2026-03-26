import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ShutdownService {
  private readonly logger = new Logger(ShutdownService.name);
  private isShuttingDown = false;
  private shutdownStartedAt?: number;

  beginShutdown() {
    if (this.isShuttingDown) return;

    this.isShuttingDown = true;
    this.shutdownStartedAt = Date.now();

    this.logger.warn('🚨 Graceful shutdown initiated');
  }

  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }

  getUptimeSinceShutdown(): number | null {
    if (!this.shutdownStartedAt) return null;
    return Date.now() - this.shutdownStartedAt;
  }
}