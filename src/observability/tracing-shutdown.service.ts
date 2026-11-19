import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { shutdownTracing } from '../tracing';

/**
 * Flushes OpenTelemetry spans as part of Nest's shutdown sequence (issue #1539),
 * instead of a SIGTERM listener in tracing.ts that called process.exit(0) while
 * requests, DB transactions and queue jobs were still being drained.
 *
 * `enableShutdownHooks()` (main.ts) already covers SIGTERM and SIGINT.
 */
@Injectable()
export class TracingShutdownService implements OnApplicationShutdown {
  private readonly logger = new Logger(TracingShutdownService.name);

  async onApplicationShutdown(signal?: string): Promise<void> {
    const flushed = await shutdownTracing();
    this.logger.log(
      `Tracing ${flushed ? 'flushed' : 'not flushed (timeout or error)'}${signal ? ` on ${signal}` : ''}`,
    );
  }
}
