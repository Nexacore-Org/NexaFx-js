import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { DeviceService } from "./device.service"
import { DeviceController } from "./device.controller"
import { Device } from "./entities/device.entity"
import { DeviceSession } from "./entities/device-session.entity"
import { DeviceAnomaly } from "./entities/device-anomaly.entity"
import { NotificationService } from "../notifications/notification.service"

@Module({
  imports: [TypeOrmModule.forFeature([Device, DeviceSession, DeviceAnomaly])],
  controllers: [DeviceController],
  providers: [DeviceService, NotificationService],
  exports: [DeviceService],
})
export class DeviceModule {}
