import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { DeviceToken } from '../device-token.entity';
import { PushNotificationService } from './push.service';
import { DevicesController } from '../devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken]), HttpModule],
  controllers: [DevicesController],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class PushModule {}
