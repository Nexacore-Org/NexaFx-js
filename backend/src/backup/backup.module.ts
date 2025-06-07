import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { ScheduleModule } from "@nestjs/schedule"
import { BackupService } from "./backup.service"
import { BackupController } from "./backup.controller"
import { AdminGuard } from "./guards/admin.guard"
import { ApiKeyGuard } from "./guards/api-key.guard"
import { SessionModule } from "../session/session.module"

@Module({
  imports: [ConfigModule, ScheduleModule, SessionModule],
  providers: [BackupService, AdminGuard, ApiKeyGuard],
  controllers: [BackupController],
  exports: [BackupService],
})
export class BackupModule {}
