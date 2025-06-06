import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { HoneypotService } from "./honeypot.service"
import { HoneypotController } from "./honeypot.controller"
import { HoneypotAccess } from "./entities/honeypot-access.entity"
import { NotificationService } from "../notifications/notification.service"

@Module({
  imports: [TypeOrmModule.forFeature([HoneypotAccess])],
  controllers: [HoneypotController],
  providers: [HoneypotService, NotificationService],
  exports: [HoneypotService],
})
export class HoneypotModule {}
