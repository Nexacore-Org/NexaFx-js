import { Module, Global } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import Redis from 'ioredis';

@Global()
@Module({
  providers: [
    {
      provide: 'CIRCUIT_BREAKER_REDIS',
      useFactory: () =>
        new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          lazyConnect: true,
          enableReadyCheck: false,
        }),
    },
    {
      provide: CircuitBreakerService,
      useFactory: (redis: Redis) => new CircuitBreakerService(redis),
      inject: ['CIRCUIT_BREAKER_REDIS'],
    },
  ],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
