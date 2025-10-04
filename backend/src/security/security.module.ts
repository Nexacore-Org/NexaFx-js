import { Module, DynamicModule, Global } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { RateLimitService } from './services/rate-limit.service';
import { IpBlockService } from './services/ip-block.service';
import { SecurityEventsService } from './services/security-events.service';
import { BruteForceService } from './services/brute-force.service';
import { CaptchaService } from './services/captcha.service';
import { ApiKeyService } from './services/api-key.service';
import { SessionSecurityService } from './services/session-security.service';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { IpBlockGuard } from './guards/ip-block.guard';
import { RateLimitController } from './controllers/rate-limit.controller';
import { IpBlockController } from './controllers/ip-block.controller';
import { SecurityController } from './controllers/security.controller';
import { ApiKeyController } from './controllers/api-key.controller';
import { SessionController } from './controllers/session.controller';
import { SecurityHeadersInterceptor } from './interceptors/security-headers.interceptor';
import {
  RATE_LIMIT_OPTIONS,
  RATE_LIMIT_DEFAULTS,
} from './constants/rate-limit.constants';
import { RateLimitOptions } from './interfaces/rate-limit-options.interface';

@Global()
@Module({})
export class SecurityModule {
  static forRoot(options: Partial<RateLimitOptions> = {}): DynamicModule {
    const mergedOptions = { ...RATE_LIMIT_DEFAULTS, ...options };

    return {
      module: SecurityModule,
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 100,
          },
        ]),
      ],
      providers: [
        {
          provide: RATE_LIMIT_OPTIONS,
          useValue: mergedOptions,
        },
        {
          provide: 'REDIS_CLIENT',
          useFactory: () => {
            return new Redis({
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379', 10),
              password: process.env.REDIS_PASSWORD,
              db: parseInt(process.env.REDIS_DB || '0', 10),
              retryStrategy: (times: number) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
              },
            });
          },
        },
        // Services
        RateLimitService,
        IpBlockService,
        SecurityEventsService,
        BruteForceService,
        CaptchaService,
        ApiKeyService,
        SessionSecurityService,
        // Guards
        RateLimitGuard,
        IpBlockGuard,
        {
          provide: APP_GUARD,
          useClass: IpBlockGuard,
        },
        // Interceptors
        {
          provide: APP_INTERCEPTOR,
          useClass: SecurityHeadersInterceptor,
        },
      ],
      controllers: [
        RateLimitController,
        IpBlockController,
        SecurityController,
        ApiKeyController,
        SessionController,
      ],
      exports: [
        RateLimitService,
        IpBlockService,
        SecurityEventsService,
        BruteForceService,
        CaptchaService,
        ApiKeyService,
        SessionSecurityService,
        RateLimitGuard,
        IpBlockGuard,
      ],
    };
  }
}
