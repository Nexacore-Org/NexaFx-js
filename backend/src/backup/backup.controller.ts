import { Controller, Post, Get, Delete } from "@nestjs/common"
import type { BackupService } from "./services/backup.service"
import type { RestoreService } from "./services/restore.service"
import type { VerificationService } from "./services/verification.service"
import type { RetentionService } from "./services/retention.service"
import type { DisasterRecoveryService } from "./services/disaster-recovery.service"
import type { BackupSchedulerService } from "./services/backup-scheduler.service"
import type { StorageService } from "./services/storage.service"
import type { TriggerBackupDto } from "./dto/trigger-backup.dto"
import type { RestoreBackupDto } from "./dto/restore-backup.dto"
import type { ConfigureRetentionDto } from "./dto/configure-retention.dto"
import type { ConfigureScheduleDto } from "./dto/configure-schedule.dto"
import type { ExportBackupDto } from "./dto/export-backup.dto"
import type { TestRestoreDto } from "./dto/test-restore.dto"
import type { VerifyBackupDto } from "./dto/verify-backup.dto"

@Controller("backup/admin")

export class BackupController {
  constructor(
    private readonly backupService: BackupService,
    private readonly restoreService: RestoreService,
    private readonly verificationService: VerificationService,
    private readonly retentionService: RetentionService,
    private readonly disasterRecoveryService: DisasterRecoveryService,
    private readonly schedulerService: BackupSchedulerService,
    private readonly storageService: StorageService,
  ) {}

  @Post("trigger")
  async triggerBackup(dto: TriggerBackupDto) {
    return this.backupService.triggerManualBackup(dto)
  }

  @Get("status")
  async getStatus() {
    return this.backupService.getCurrentStatus()
  }

  @Get("history")
  async getHistory(pageParam?: string, limitParam?: string) {
    const page = pageParam ? Number.parseInt(pageParam, 10) : 1
    const limit = limitParam ? Number.parseInt(limitParam, 10) : 50
    return this.backupService.getBackupHistory(page, limit)
  }

  @Get("list")
  async listBackups(type?: string, status?: string) {
    return this.backupService.listAvailableBackups(type, status)
  }

  @Post("restore")
  async initiateRestore(dto: RestoreBackupDto) {
    return this.restoreService.initiateRestore(dto)
  }

  @Get("restore/:jobId/status")
  async getRestoreStatus(jobId: string) {
    return this.restoreService.getRestoreJobStatus(jobId)
  }

  @Post("verify")
  async verifyBackup(dto: VerifyBackupDto) {
    return this.verificationService.verifyBackupIntegrity(dto.backupId)
  }

  @Get("storage-usage")
  async getStorageUsage() {
    return this.storageService.getStorageStatistics()
  }

  @Post("retention/configure")
  async configureRetention(dto: ConfigureRetentionDto) {
    return this.retentionService.configureRetentionPolicy(dto)
  }

  @Get("retention/policy")
  async getRetentionPolicy() {
    return this.retentionService.getCurrentRetentionPolicy()
  }

  @Delete(":backupId")
  async deleteBackup(backupId: string) {
    return this.backupService.deleteBackup(backupId)
  }

  @Post("schedule")
  async configureSchedule(dto: ConfigureScheduleDto) {
    return this.schedulerService.configureSchedule(dto)
  }

  @Get("schedule")
  async getSchedule() {
    return this.schedulerService.getScheduleConfiguration()
  }

  @Post("test-restore")
  async testRestore(dto: TestRestoreDto) {
    return this.restoreService.testRestoreInIsolation(dto)
  }

  @Get("disaster-recovery/plan")
  async getDRPlan() {
    return this.disasterRecoveryService.getDRPlanDocumentation()
  }

  @Post("disaster-recovery/test")
  async testDR() {
    return this.disasterRecoveryService.runDRTestDrill()
  }

  @Get("encryption/status")
  async getEncryptionStatus() {
    return this.backupService.getEncryptionStatus()
  }

  @Post("export")
  async exportBackup(dto: ExportBackupDto) {
    return this.storageService.exportToExternalStorage(dto)
  }
}
