import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DeviceEntity } from './entities/device.entity';
import { DeviceTrustService } from './services/device-trust.service';
import { DeviceService } from './services/device.service';
import { DeviceController } from './controllers/device.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity])],
  controllers: [DeviceController],
  providers: [DeviceTrustService, DeviceService],
  exports: [DeviceService],
})
export class SessionsModule {}
