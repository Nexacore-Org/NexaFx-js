import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceEntity } from './entities/device.entity';
import { DeviceService } from './services/device.service';
import { DeviceController } from './controllers/device.controller';
import { AdminAuditModule } from '../admin-audit/admin-audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceEntity]), AdminAuditModule],
  controllers: [DeviceController],
  providers: [DeviceService],
  exports: [DeviceService],
})
export class SessionsModule {}
