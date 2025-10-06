import { Injectable, Logger } from "@nestjs/common"
import { type Repository, LessThan } from "typeorm"
import { Cron } from "@nestjs/schedule"
import type { BackupMetadata } from "../entities/backup-metadata.entity"
import type { StorageService } from "./storage.service"
import { BackupType } from "./backup.service"
import type { ConfigureRetentionDto } from "../dto/configure-retention.dto"

interface RetentionPolicy {
  dailyBackups: number 
  weeklyBackups: number 
  monthlyBackups: number 
  yearlyBackups: number 
  transactionLogs: number 
}

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name)
  private retentionPolicy: RetentionPolicy = {
    dailyBackups: 7,
    weeklyBackups: 4,
    monthlyBackups: 12,
    yearlyBackups: 7,
    transactionLogs: 90,
  }

  constructor(
    private readonly backupRepo: Repository<BackupMetadata>,
    private readonly storageService: StorageService,
  ) {}

  @Cron("0 4 * * *") // Daily at 4 AM
  async enforceRetentionPolicy() {
    this.logger.log("Starting retention policy enforcement")

    try {
      await this.cleanupDailyBackups()
      await this.cleanupWeeklyBackups()
      await this.cleanupMonthlyBackups()
      await this.cleanupYearlyBackups()
      await this.cleanupTransactionLogs()

      this.logger.log("Retention policy enforcement completed")
    } catch (error) {
      this.logger.error("Retention policy enforcement failed", error)
    }
  }

  private async cleanupDailyBackups() {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionPolicy.dailyBackups)

    const oldBackups = await this.backupRepo.find({
      where: {
        type: BackupType.FULL,
        completedAt: LessThan(cutoffDate),
        retentionTag: "daily",
      },
    })

    for (const backup of oldBackups) {
      await this.deleteBackup(backup)
    }

    this.logger.log(`Cleaned up ${oldBackups.length} daily backups`)
  }

  private async cleanupWeeklyBackups() {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionPolicy.weeklyBackups * 7)

    const oldBackups = await this.backupRepo.find({
      where: {
        type: BackupType.FULL,
        completedAt: LessThan(cutoffDate),
        retentionTag: "weekly",
      },
    })

    for (const backup of oldBackups) {
      await this.deleteBackup(backup)
    }

    this.logger.log(`Cleaned up ${oldBackups.length} weekly backups`)
  }

  private async cleanupMonthlyBackups() {
    const cutoffDate = new Date()
    cutoffDate.setMonth(cutoffDate.getMonth() - this.retentionPolicy.monthlyBackups)

    const oldBackups = await this.backupRepo.find({
      where: {
        type: BackupType.FULL,
        completedAt: LessThan(cutoffDate),
        retentionTag: "monthly",
      },
    })

    for (const backup of oldBackups) {
      await this.deleteBackup(backup)
    }

    this.logger.log(`Cleaned up ${oldBackups.length} monthly backups`)
  }

  private async cleanupYearlyBackups() {
    const cutoffDate = new Date()
    cutoffDate.setFullYear(cutoffDate.getFullYear() - this.retentionPolicy.yearlyBackups)

    const oldBackups = await this.backupRepo.find({
      where: {
        type: BackupType.FULL,
        completedAt: LessThan(cutoffDate),
        retentionTag: "yearly",
      },
    })

    for (const backup of oldBackups) {
      await this.deleteBackup(backup)
    }

    this.logger.log(`Cleaned up ${oldBackups.length} yearly backups`)
  }

  private async cleanupTransactionLogs() {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionPolicy.transactionLogs)

    const oldLogs = await this.backupRepo.find({
      where: {
        type: BackupType.TRANSACTION_LOG,
        completedAt: LessThan(cutoffDate),
      },
    })

    for (const log of oldLogs) {
      await this.deleteBackup(log)
    }

    this.logger.log(`Cleaned up ${oldLogs.length} transaction logs`)
  }

  private async deleteBackup(backup: BackupMetadata) {
    try {
      await this.storageService.deleteFromAllLocations(backup.storageLocations)
      await this.backupRepo.remove(backup)
      this.logger.log(`Deleted backup: ${backup.id}`)
    } catch (error) {
      this.logger.error(`Failed to delete backup ${backup.id}`, error)
    }
  }

  async configureRetentionPolicy(dto: ConfigureRetentionDto) {
    this.retentionPolicy = {
      dailyBackups: dto.dailyBackups ?? this.retentionPolicy.dailyBackups,
      weeklyBackups: dto.weeklyBackups ?? this.retentionPolicy.weeklyBackups,
      monthlyBackups: dto.monthlyBackups ?? this.retentionPolicy.monthlyBackups,
      yearlyBackups: dto.yearlyBackups ?? this.retentionPolicy.yearlyBackups,
      transactionLogs: dto.transactionLogs ?? this.retentionPolicy.transactionLogs,
    }

    this.logger.log("Retention policy updated", this.retentionPolicy)

    return {
      success: true,
      policy: this.retentionPolicy,
    }
  }

  async getCurrentRetentionPolicy() {
    return this.retentionPolicy
  }
}
