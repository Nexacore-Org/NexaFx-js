import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceEntity } from './entities/device.entity';
import { DeviceTrustService } from './device-trust/device-trust.service';
import { DeviceService } from './device-trust/device.service';
import { DevicesController } from './controllers/devices.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity])],
  controllers: [DevicesController],
  providers: [DeviceTrustService, DeviceService],
  exports: [DeviceService],
})
export class SessionsModule {}
