import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EndpointRateLimitConfigEntity } from './entities/endpoint-rate-limit-config.entity';
import {
  ENDPOINT_RATE_LIMIT_REDIS,
  EndpointRateLimitService,
} from './services/endpoint-rate-limit.service';
import { EndpointRateLimitGuard } from './guards/endpoint-rate-limit.guard';
import { EndpointRateLimitController } from './controllers/endpoint-rate-limit.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([EndpointRateLimitConfigEntity]),
  ],
  controllers: [EndpointRateLimitController],
  providers: [
    {
      provide: ENDPOINT_RATE_LIMIT_REDIS,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redis = config.get<{ host?: string; port?: number; password?: string }>('redis');
        return new Redis({
          host: redis?.host ?? 'localhost',
          port: redis?.port ?? 6379,
          password: redis?.password,
        });
      },
    },
    EndpointRateLimitService,
    EndpointRateLimitGuard,
  ],
  exports: [EndpointRateLimitService, EndpointRateLimitGuard],
})
export class EndpointRateLimitModule {}
