import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigService } from '@nestjs/config';
import * as redisStore from 'cache-manager-redis-store';
import { CacheService } from './services/cache.service';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      inject: [ConfigService],
      isGlobal: true,
      useFactory: async (configService: ConfigService) => {
        try {
          return {
            store: redisStore as any,
            url: configService.get<string>('REDIS_URL'),
            ttl: 5, // default fallback TTL
          };
        } catch (err) {
          Logger.warn('Redis not available, falling back to memory cache');
          return {
            ttl: 5,
          };
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}