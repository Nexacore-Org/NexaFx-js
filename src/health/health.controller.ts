import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import { Public } from '../auth/decorators/public.decorator';
import Redis from 'ioredis';
import { HealthResponseDto } from './dto/health-response.dto';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get service health status' })
  @ApiOkResponse({ type: HealthResponseDto })
  async check(): Promise<HealthResponseDto> {
    const [database, redis, memory, disk] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkDisk(),
    ]);

    const degraded = [database, redis, memory, disk].some(
      (component) => component.status !== 'up',
    );

    return {
      status: degraded ? 'degraded' : 'ok',
      details: {
        database,
        redis,
        memory,
        disk,
      },
    };
  }

  private async checkDatabase() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'up' };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Database unavailable';
      return { status: 'down', message };
    }
  }

  private async checkRedis() {
    if (process.env.DISABLE_BULL === 'true' || process.env.NODE_ENV === 'test') {
      return {
        status: 'degraded',
        message: 'Redis disabled for this environment; using in-memory fallbacks',
      };
    }

    const redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      lazyConnect: true,
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
    });

    try {
      await redis.connect();
      await redis.ping();
      return { status: 'up' };
    } catch {
      return {
        status: 'degraded',
        message: 'Redis unavailable; using in-memory fallbacks where possible',
      };
    } finally {
      redis.disconnect();
    }
  }

  private async checkMemory() {
    const used = process.memoryUsage().heapUsed;
    const threshold = 150 * 1024 * 1024;

    if (used > threshold) {
      return { status: 'degraded', message: `Heap usage ${used} exceeds ${threshold}` };
    }

    return { status: 'up' };
  }

  private async checkDisk() {
    return { status: 'up' };
  }
}
