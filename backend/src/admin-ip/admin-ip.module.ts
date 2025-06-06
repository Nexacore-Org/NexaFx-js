import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { AdminIpService } from "./admin-ip.service"
import { AdminIpController } from "./admin-ip.controller"
import { AdminIpGuard } from "./guards/admin-ip.guard"
import { AdminIpWhitelist } from "./entities/admin-ip-whitelist.entity"
import { AdminIpAccessLog } from "./entities/admin-ip-access-log.entity"
import { NotificationService } from "../notifications/notification.service"

@Module({
  imports: [TypeOrmModule.forFeature([AdminIpWhitelist, AdminIpAccessLog])],
  controllers: [AdminIpController],
  providers: [AdminIpService, AdminIpGuard, NotificationService],
  exports: [AdminIpService, AdminIpGuard],
})
export class AdminIpModule {}
