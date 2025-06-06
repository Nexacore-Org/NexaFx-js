import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { SuspiciousActivityService } from "./suspicious-activity.service"
import { SuspiciousActivityController } from "./suspicious-activity.controller"
import { SuspiciousActivity } from "./entities/suspicious-activity.entity"
import { ActivityRule } from "./entities/activity-rule.entity"
import { NotificationService } from "../notifications/notification.service"

@Module({
  imports: [TypeOrmModule.forFeature([SuspiciousActivity, ActivityRule])],
  controllers: [SuspiciousActivityController],
  providers: [SuspiciousActivityService, NotificationService],
  exports: [SuspiciousActivityService],
})
export class SuspiciousActivityModule {}
