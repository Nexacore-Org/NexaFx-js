import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that fans events out through Redis so gateways work across
 * several replicas (issues #771/#1590).
 *
 * Uses `ioredis` — already a direct dependency and the client the rest of the
 * app uses — instead of the `redis` package, which was never installed.
 * Wired in main.ts only when Redis is configured.
 */
export class RedisIoAdapter
  extends IoAdapter
  implements OnApplicationShutdown
{
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;
  private pubClient?: Redis;
  private subClient?: Redis;

  async connectToRedis(url: string): Promise<void> {
    this.pubClient = new Redis(url);
    this.subClient = this.pubClient.duplicate();

    for (const [name, client] of [
      ['pub', this.pubClient],
      ['sub', this.subClient],
    ] as const) {
      // An unhandled 'error' event on an ioredis client crashes the process.
      client.on('error', (err) =>
        this.logger.error(`Redis ${name} client error: ${err.message}`),
      );
    }

    // ioredis connects lazily; ping makes the constructor fail fast.
    await Promise.all([this.pubClient.ping(), this.subClient.ping()]);
    this.adapterConstructor = createAdapter(this.pubClient, this.subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all(
      [this.pubClient, this.subClient].map(async (client) => {
        if (!client) return;
        try {
          await client.quit();
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          this.logger.warn(`Failed to close Redis client: ${detail}`);
        }
      }),
    );
  }
}
