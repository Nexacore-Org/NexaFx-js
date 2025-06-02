import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SecretsController } from './secrets.controller';
import { SecretsService } from './secrets.service';
import { Secret } from './entities/secret.entity';
import { AffectedService } from './entities/affected-service.entity';
import { NotificationModule } from '../notifications/notification.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Secret, AffectedService]),
    ConfigModule,
    EventEmitterModule,
    NotificationModule,
    AuthModule,
  ],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
