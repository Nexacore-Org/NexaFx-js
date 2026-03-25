import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsPersistenceService } from './notifications-persistence.service';
import { NotificationsController } from './notifications.controller';
import { PersistedNotification } from './entities/persisted-notification.entity';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { WsLoggingInterceptor } from './interceptors/ws-logging.interceptor';
import { PriceFeedGateway } from './gateways/price-feed.gateway';
import { PositionFeedGateway } from './gateways/position-feed.gateway';
import { MarketDataService } from './services/market-data.service';
import { FxModule } from '../modules/fx/fx.module';
import { PriceBroadcastJob } from '../modules/fx/jobs/price-broadcast.job';
import { AdminGuard } from '../modules/auth/guards/admin.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([PersistedNotification]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') ?? 'development-secret',
        signOptions: {
          expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ?? '7d') as any,
        },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ConfigModule,
    FxModule,
  ],
  providers: [
    NotificationsGateway,
    PriceFeedGateway,
    PositionFeedGateway,
    NotificationsService,
    NotificationsPersistenceService,
    MarketDataService,
    PriceBroadcastJob,
    AdminGuard,
    WsJwtGuard,
    WsLoggingInterceptor,
  ],
  controllers: [NotificationsController],
  exports: [
    NotificationsService,
    NotificationsGateway,
    PriceFeedGateway,
    PositionFeedGateway,
    MarketDataService,
  ],
})
export class NotificationsModule {}
