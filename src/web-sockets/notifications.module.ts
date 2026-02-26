import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';
import { NotificationsPersistenceService } from './notifications-persistence.service';
import { NotificationsController } from './notifications.controller';
import { PersistedNotification } from './entities/persisted-notification.entity';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { WsLoggingInterceptor } from './interceptors/ws-logging.interceptor';

@Module({
  imports: [
    TypeOrmModule.forFeature([PersistedNotification]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') },
      }),
      inject: [ConfigService],
    }),
    ScheduleModule.forRoot(),
    ConfigModule,
  ],
  providers: [
    NotificationsGateway,
    NotificationsService,
    NotificationsPersistenceService,
    WsJwtGuard,
    WsLoggingInterceptor,
  ],
  controllers: [NotificationsController],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
