import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { BullModule } from "@nestjs/bull"
import { ScheduleModule } from "@nestjs/schedule"
import { BackupController } from "./backup.controller"
import { BackupService } from "./services/backup.service"
import { RestoreService } from "./services/restore.service"
import { EncryptionService } from "./services/encryption.service"
import { StorageService } from "./services/storage.service"
import { VerificationService } from "./services/verification.service"
import { RetentionService } from "./services/retention.service"
import { DisasterRecoveryService } from "./services/disaster-recovery.service"
import { BackupSchedulerService } from "./services/backup-scheduler.service"
import { BackupProcessor } from "./processors/backup.processor"
import { BackupMetadata } from "./entities/backup-metadata.entity"
import { RestoreJob } from "./entities/restore-job.entity"
import { BackupSchedule } from "./entities/backup-schedule.entity"

@Module({
  imports: [
    TypeOrmModule.forFeature([BackupMetadata, RestoreJob, BackupSchedule]),
    BullModule.registerQueue({
      name: "backup",
    }),
    ScheduleModule.forRoot(),
  ],
  controllers: [BackupController],
  providers: [
    BackupService,
    RestoreService,
    EncryptionService,
    StorageService,
    VerificationService,
    RetentionService,
    DisasterRecoveryService,
    BackupSchedulerService,
    BackupProcessor,
  ],
  exports: [BackupService, RestoreService],
})
export class BackupModule {}
