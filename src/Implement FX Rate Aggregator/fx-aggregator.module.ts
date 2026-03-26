import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { FxAggregatorService } from './fx-aggregator.service';
import { FxController } from './fx.controller';
import { CircuitBreakerService } from './circuit-breaker.service';
import { ProviderAService } from './providers/providerA.service';
import { ProviderBService } from './providers/providerB.service';
import { ProviderCService } from './providers/providerC.service';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        timeout: 5000,
        maxRedirects: 3,
      }),
      inject: [ConfigService],
    }),
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);

        // Use in-memory cache when Redis is not configured (development/test)
        if (redisHost === 'localhost' && process.env.NODE_ENV === 'test') {
          return { ttl: configService.get<number>('FX_CACHE_TTL', 30) * 1000 };
        }

        try {
          const { redisStore } = await import('cache-manager-redis-yet');
          return {
            store: redisStore,
            socket: { host: redisHost, port: redisPort },
            ttl: configService.get<number>('FX_CACHE_TTL', 30) * 1000,
          };
        } catch {
          // Fall back to in-memory if redis package isn't available
          return { ttl: configService.get<number>('FX_CACHE_TTL', 30) * 1000 };
        }
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [FxController],
  providers: [
    FxAggregatorService,
    CircuitBreakerService,
    ProviderAService,
    ProviderBService,
    ProviderCService,
  ],
  exports: [FxAggregatorService],
})
export class FxModule {}
