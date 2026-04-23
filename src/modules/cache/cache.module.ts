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
          const redisUrl = configService.get<string>('REDIS_URL');
          if (!redisUrl) {
            Logger.warn('REDIS_URL not set, using in-memory cache', 'CacheModule');
            return { ttl: 5 };
          }
          return {
            store: redisStore as any,
            url: redisUrl,
            ttl: 5,
          };
        } catch (err) {
          Logger.warn(`Redis unavailable, falling back to memory cache: ${err.message}`, 'CacheModule');
          return { ttl: 5 };
        }
      },
    }),
  ],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
