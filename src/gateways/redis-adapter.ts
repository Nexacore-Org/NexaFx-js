import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that fans events out through Redis so gateways work across
 * several replicas (issue #1548). Wired in main.ts only when REDIS_URL is set.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(url: string = process.env.REDIS_URL || 'redis://localhost:6379'): Promise<void> {
    const pubClient = createClient({ url });
    const subClient = pubClient.duplicate();

    // An unhandled 'error' event on a node-redis client crashes the process.
    pubClient.on('error', (err) => this.logger.error(`Redis pub client error: ${err.message}`));
    subClient.on('error', (err) => this.logger.error(`Redis sub client error: ${err.message}`));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
