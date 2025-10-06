import { Injectable, Logger } from "@nestjs/common"
import type { Repository } from "typeorm"
import type { Queue } from "bull"
import { Cron } from "@nestjs/schedule"
import type { BackupMetadata } from "../entities/backup-metadata.entity"
import type { EncryptionService } from "./encryption.service"
import type { StorageService } from "./storage.service"
import type { TriggerBackupDto } from "../dto/trigger-backup.dto"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"
import * as zlib from "zlib"
import { pipeline } from "stream/promises"
import { createReadStream, createWriteStream } from "fs"

const execAsync = promisify(exec)

export enum BackupType {
  FULL = "FULL",
  INCREMENTAL = "INCREMENTAL",
  TRANSACTION_LOG = "TRANSACTION_LOG",
  CONFIGURATION = "CONFIGURATION",
  FILE_STORAGE = "FILE_STORAGE",
}

export enum BackupStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  VERIFYING = "VERIFYING",
  VERIFIED = "VERIFIED",
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name)
  private readonly tempBackupDir = "/tmp/backups"

  constructor(
    private readonly backupRepo: Repository<BackupMetadata>,
    private readonly backupQueue: Queue,
    private readonly encryptionService: EncryptionService,
    private readonly storageService: StorageService,
  ) {
    this.initializeTempDirectory()
  }

  private async initializeTempDirectory() {
    try {
      await fs.mkdir(this.tempBackupDir, { recursive: true })
    } catch (error) {
      this.logger.error("Failed to create temp backup directory", error)
    }
  }

  
  @Cron("0 2 * * *", { timeZone: "Africa/Lagos" }) 
  async scheduledFullBackup() {
    this.logger.log("Starting scheduled full database backup")
    await this.triggerManualBackup({ type: BackupType.FULL })
  }

  @Cron("0 */6 * * *") 
  async scheduledIncrementalBackup() {
    this.logger.log("Starting scheduled incremental backup")
    await this.triggerManualBackup({ type: BackupType.INCREMENTAL })
  }

  @Cron("*/15 * * * *") 
  async scheduledTransactionLogBackup() {
    this.logger.log("Starting scheduled transaction log backup")
    await this.triggerManualBackup({ type: BackupType.TRANSACTION_LOG })
  }

  @Cron("0 3 * * *", { timeZone: "Africa/Lagos" }) 
  async scheduledFileStorageBackup() {
    this.logger.log("Starting scheduled file storage backup")
    await this.triggerManualBackup({ type: BackupType.FILE_STORAGE })
  }

  async triggerManualBackup(dto: TriggerBackupDto) {
    const metadata = this.backupRepo.create({
      type: dto.type,
      status: BackupStatus.PENDING,
      triggeredBy: dto.triggeredBy || "system",
      startedAt: new Date(),
    })

    await this.backupRepo.save(metadata)

    
    await this.backupQueue.add("perform-backup", {
      backupId: metadata.id,
      type: dto.type,
    })

    return {
      success: true,
      backupId: metadata.id,
      message: "Backup job queued successfully",
    }
  }

  async performBackup(backupId: string, type: BackupType) {
    const metadata = await this.backupRepo.findOne({ where: { id: backupId } })
    if (!metadata) {
      throw new Error("Backup metadata not found")
    }

    try {
      metadata.status = BackupStatus.IN_PROGRESS
      await this.backupRepo.save(metadata)

      let backupFilePath: string

      switch (type) {
        case BackupType.FULL:
          backupFilePath = await this.performFullDatabaseBackup(backupId)
          break
        case BackupType.INCREMENTAL:
          backupFilePath = await this.performIncrementalBackup(backupId)
          break
        case BackupType.TRANSACTION_LOG:
          backupFilePath = await this.performTransactionLogBackup(backupId)
          break
        case BackupType.CONFIGURATION:
          backupFilePath = await this.performConfigurationBackup(backupId)
          break
        case BackupType.FILE_STORAGE:
          backupFilePath = await this.performFileStorageBackup(backupId)
          break
        default:
          throw new Error(`Unknown backup type: ${type}`)
      }

      // Compress backup
      const compressedPath = await this.compressBackup(backupFilePath)

      // Encrypt backup
      const encryptedPath = await this.encryptionService.encryptFile(compressedPath)

      // Get file stats
      const stats = await fs.stat(encryptedPath)

      // Upload to multiple storage locations
      const storageLocations = await this.storageService.uploadToMultipleLocations(encryptedPath, backupId, type)

      // Update metadata
      metadata.status = BackupStatus.COMPLETED
      metadata.completedAt = new Date()
      metadata.filePath = encryptedPath
      metadata.fileSize = stats.size
      metadata.storageLocations = storageLocations
      metadata.checksum = await this.calculateChecksum(encryptedPath)

      await this.backupRepo.save(metadata)

      // Cleanup temp files
      await this.cleanupTempFiles([backupFilePath, compressedPath])

      this.logger.log(`Backup ${backupId} completed successfully`)

      return metadata
    } catch (error) {
      this.logger.error(`Backup ${backupId} failed`, error)
      metadata.status = BackupStatus.FAILED
      metadata.errorMessage = error.message
      await this.backupRepo.save(metadata)
      throw error
    }
  }

  private async performFullDatabaseBackup(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `full_backup_${timestamp}.sql`
    const filepath = path.join(this.tempBackupDir, filename)

    const dbHost = process.env.DB_HOST || "localhost"
    const dbPort = process.env.DB_PORT || "5432"
    const dbName = process.env.DB_NAME || "naira_platform"
    const dbUser = process.env.DB_USER || "postgres"
    const dbPassword = process.env.DB_PASSWORD

    // Using pg_dump for PostgreSQL
    const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -F c -b -v -f ${filepath} ${dbName}`

    await execAsync(command)

    this.logger.log(`Full database backup created: ${filepath}`)
    return filepath
  }

  private async performIncrementalBackup(backupId: string): Promise<string> {
    // Get last full backup
    const lastFullBackup = await this.backupRepo.findOne({
      where: { type: BackupType.FULL, status: BackupStatus.VERIFIED },
      order: { completedAt: "DESC" },
    })

    if (!lastFullBackup) {
      this.logger.warn("No full backup found, performing full backup instead")
      return this.performFullDatabaseBackup(backupId)
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `incremental_backup_${timestamp}.sql`
    const filepath = path.join(this.tempBackupDir, filename)

    // Incremental backup using WAL files or timestamp-based changes
    const dbHost = process.env.DB_HOST || "localhost"
    const dbPort = process.env.DB_PORT || "5432"
    const dbName = process.env.DB_NAME || "naira_platform"
    const dbUser = process.env.DB_USER || "postgres"
    const dbPassword = process.env.DB_PASSWORD

    // This is a simplified version - in production, use WAL archiving
    const sinceTimestamp = lastFullBackup.completedAt.toISOString()
    const command = `PGPASSWORD="${dbPassword}" pg_dump -h ${dbHost} -p ${dbPort} -U ${dbUser} -F c -b -v -f ${filepath} ${dbName}`

    await execAsync(command)

    this.logger.log(`Incremental backup created: ${filepath}`)
    return filepath
  }

  private async performTransactionLogBackup(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `wal_backup_${timestamp}.tar`
    const filepath = path.join(this.tempBackupDir, filename)

    // Archive WAL files for point-in-time recovery
    const walArchiveDir = process.env.WAL_ARCHIVE_DIR || "/var/lib/postgresql/wal_archive"

    const command = `tar -czf ${filepath} -C ${walArchiveDir} .`
    await execAsync(command)

    this.logger.log(`Transaction log backup created: ${filepath}`)
    return filepath
  }

  private async performConfigurationBackup(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `config_backup_${timestamp}.tar.gz`
    const filepath = path.join(this.tempBackupDir, filename)

    
    const configDirs = ["./config", "./src/config", ".env.example", "package.json", "tsconfig.json"]

    const command = `tar -czf ${filepath} ${configDirs.join(" ")}`
    await execAsync(command)

    this.logger.log(`Configuration backup created: ${filepath}`)
    return filepath
  }

  private async performFileStorageBackup(backupId: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const filename = `files_backup_${timestamp}.tar.gz`
    const filepath = path.join(this.tempBackupDir, filename)

    
    const uploadDir = process.env.UPLOAD_DIR || "./uploads"

    const command = `tar -czf ${filepath} -C ${uploadDir} .`
    await execAsync(command)

    this.logger.log(`File storage backup created: ${filepath}`)
    return filepath
  }

  private async compressBackup(filePath: string): Promise<string> {
    const compressedPath = `${filePath}.gz`
    const gzip = zlib.createGzip({ level: 9 })

    await pipeline(createReadStream(filePath), gzip, createWriteStream(compressedPath))

    this.logger.log(`Backup compressed: ${compressedPath}`)
    return compressedPath
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = require("crypto")
    const hash = crypto.createHash("sha256")
    const stream = createReadStream(filePath)

    return new Promise((resolve, reject) => {
      stream.on("data", (data) => hash.update(data))
      stream.on("end", () => resolve(hash.digest("hex")))
      stream.on("error", reject)
    })
  }

  private async cleanupTempFiles(filePaths: string[]) {
    for (const filePath of filePaths) {
      try {
        await fs.unlink(filePath)
      } catch (error) {
        this.logger.warn(`Failed to cleanup temp file: ${filePath}`, error)
      }
    }
  }

  async getCurrentStatus() {
    const inProgress = await this.backupRepo.count({
      where: { status: BackupStatus.IN_PROGRESS },
    })

    const lastBackup = await this.backupRepo.findOne({
      order: { completedAt: "DESC" },
    })

    const failedToday = await this.backupRepo.count({
      where: {
        status: BackupStatus.FAILED,
        startedAt: new Date(new Date().setHours(0, 0, 0, 0)),
      },
    })

    return {
      inProgress,
      lastBackup,
      failedToday,
      systemHealth: failedToday === 0 ? "healthy" : "degraded",
    }
  }

  async getBackupHistory(page: number, limit: number) {
    const [backups, total] = await this.backupRepo.findAndCount({
      order: { startedAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    })

    return {
      backups,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async listAvailableBackups(type?: string, status?: string) {
    const where: any = {}
    if (type) where.type = type
    if (status) where.status = status

    const backups = await this.backupRepo.find({
      where,
      order: { completedAt: "DESC" },
    })

    return backups
  }

  async deleteBackup(backupId: string) {
    const backup = await this.backupRepo.findOne({ where: { id: backupId } })
    if (!backup) {
      throw new Error("Backup not found")
    }

    
    await this.storageService.deleteFromAllLocations(backup.storageLocations)

    
    await this.backupRepo.remove(backup)

    return { success: true, message: "Backup deleted successfully" }
  }

  async getEncryptionStatus() {
    const totalBackups = await this.backupRepo.count()
    const encryptedBackups = await this.backupRepo.count({
      where: { encrypted: true },
    })

    return {
      totalBackups,
      encryptedBackups,
      encryptionRate: totalBackups > 0 ? (encryptedBackups / totalBackups) * 100 : 0,
      encryptionAlgorithm: "AES-256-GCM",
      keyRotationSchedule: "Quarterly",
    }
  }
}
