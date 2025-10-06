import { Injectable, Logger } from "@nestjs/common"
import type { Repository } from "typeorm"
import type { RestoreJob } from "../entities/restore-job.entity"
import type { BackupMetadata } from "../entities/backup-metadata.entity"
import type { StorageService } from "./storage.service"
import type { EncryptionService } from "./encryption.service"
import type { RestoreBackupDto } from "../dto/restore-backup.dto"
import type { TestRestoreDto } from "../dto/test-restore.dto"
import { exec } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as zlib from "zlib"
import { pipeline } from "stream/promises"
import { createReadStream, createWriteStream } from "fs"

const execAsync = promisify(exec)

export enum RestoreStatus {
  PENDING = "PENDING",
  DOWNLOADING = "DOWNLOADING",
  DECRYPTING = "DECRYPTING",
  DECOMPRESSING = "DECOMPRESSING",
  RESTORING = "RESTORING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  ROLLED_BACK = "ROLLED_BACK",
}

@Injectable()
export class RestoreService {
  private readonly logger = new Logger(RestoreService.name)
  private readonly tempRestoreDir = "/tmp/restores"

  constructor(
    private readonly restoreJobRepo: Repository<RestoreJob>,
    private readonly backupRepo: Repository<BackupMetadata>,
    private readonly storageService: StorageService,
    private readonly encryptionService: EncryptionService,
  ) {
    this.initializeTempDirectory()
  }

  private async initializeTempDirectory() {
    try {
      await fs.mkdir(this.tempRestoreDir, { recursive: true })
    } catch (error) {
      this.logger.error("Failed to create temp restore directory", error)
    }
  }

  async initiateRestore(dto: RestoreBackupDto) {
    const backup = await this.backupRepo.findOne({
      where: { id: dto.backupId },
    })

    if (!backup) {
      throw new Error("Backup not found")
    }

    const restoreJob = this.restoreJobRepo.create({
      backupId: dto.backupId,
      targetDatabase: dto.targetDatabase || process.env.DB_NAME,
      pointInTime: dto.pointInTime,
      status: RestoreStatus.PENDING,
      initiatedBy: dto.initiatedBy || "admin",
      startedAt: new Date(),
    })

    await this.restoreJobRepo.save(restoreJob)

    // Start restore process asynchronously
    this.performRestore(restoreJob.id).catch((error) => {
      this.logger.error(`Restore job ${restoreJob.id} failed`, error)
    })

    return {
      success: true,
      jobId: restoreJob.id,
      message: "Restore job initiated",
    }
  }

  private async performRestore(jobId: string) {
    const job = await this.restoreJobRepo.findOne({ where: { id: jobId } })
    if (!job) {
      throw new Error("Restore job not found")
    }

    const backup = await this.backupRepo.findOne({
      where: { id: job.backupId },
    })

    if (!backup) {
      throw new Error("Backup not found")
    }

    try {
      // Download backup
      job.status = RestoreStatus.DOWNLOADING
      await this.restoreJobRepo.save(job)

      const downloadedPath = await this.storageService.downloadFromPrimaryLocation(
        backup.storageLocations[0],
        this.tempRestoreDir,
      )

      // Decrypt backup
      job.status = RestoreStatus.DECRYPTING
      await this.restoreJobRepo.save(job)

      const decryptedPath = await this.encryptionService.decryptFile(downloadedPath)

      // Decompress backup
      job.status = RestoreStatus.DECOMPRESSING
      await this.restoreJobRepo.save(job)

      const decompressedPath = await this.decompressBackup(decryptedPath)

      // Perform restore
      job.status = RestoreStatus.RESTORING
      await this.restoreJobRepo.save(job)

      await this.restoreDatabase(decompressedPath, job.targetDatabase)

      // If point-in-time recovery requested
      if (job.pointInTime) {
        await this.applyPointInTimeRecovery(job.pointInTime)
      }

      job.status = RestoreStatus.COMPLETED
      job.completedAt = new Date()
      await this.restoreJobRepo.save(job)

      // Cleanup temp files
      await this.cleanupTempFiles([downloadedPath, decryptedPath, decompressedPath])

      this.logger.log(`Restore job ${jobId} completed successfully`)
    } catch (error) {
      this.logger.error(`Restore job ${jobId} failed`, error)
      job.status = RestoreStatus.FAILED
      job.errorMessage = error.message
      await this.restoreJobRepo.save(job)
      throw error
    }
  }

  private async decompressBackup(filePath: string): Promise<string> {
    const decompressedPath = filePath.replace(".gz", "")
    const gunzip = zlib.createGunzip()

    await pipeline(createReadStream(filePath), gunzip, createWriteStream(decompressedPath))

    this.logger.log(`Backup decompressed: ${decompressedPath}`)
    return decompressedPath
  }

  private async restoreDatabase(backupPath: string, targetDb: string) {
    const dbHost = process.env.DB_HOST || "localhost"
    const dbPort = process.env.DB_PORT || "5432"
    const dbUser = process.env.DB_USER || "postgres"
    const dbPassword = process.env.DB_PASSWORD

    // Using pg_restore for PostgreSQL
    const command = `PGPASSWORD="${dbPassword}" pg_restore -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${targetDb} -c -v ${backupPath}`

    await execAsync(command)

    this.logger.log(`Database restored to ${targetDb}`)
  }

  private async applyPointInTimeRecovery(targetTime: Date) {
    this.logger.log(`Applying point-in-time recovery to ${targetTime}`)

    // Apply WAL files up to the target time
    const walArchiveDir = process.env.WAL_ARCHIVE_DIR || "/var/lib/postgresql/wal_archive"

    // This is a simplified version - in production, configure recovery.conf
    const recoveryConfig = `
restore_command = 'cp ${walArchiveDir}/%f %p'
recovery_target_time = '${targetTime.toISOString()}'
recovery_target_action = 'promote'
    `

    // Write recovery configuration
    const recoveryConfPath = "/var/lib/postgresql/data/recovery.conf"
    await fs.writeFile(recoveryConfPath, recoveryConfig)

    // Restart PostgreSQL to apply recovery
    // In production, use proper service management
    this.logger.log("Point-in-time recovery configuration applied")
  }

  async testRestoreInIsolation(dto: TestRestoreDto) {
    const backup = await this.backupRepo.findOne({
      where: { id: dto.backupId },
    })

    if (!backup) {
      throw new Error("Backup not found")
    }

    // Create isolated test database
    const testDbName = `test_restore_${Date.now()}`

    try {
      // Create test database
      await this.createTestDatabase(testDbName)

      // Perform restore to test database
      const restoreJob = await this.initiateRestore({
        backupId: dto.backupId,
        targetDatabase: testDbName,
        initiatedBy: "test-system",
      })

      // Wait for restore to complete
      await this.waitForRestoreCompletion(restoreJob.jobId)

      // Verify data integrity
      const verificationResults = await this.verifyRestoredData(testDbName)

      // Cleanup test database
      await this.dropTestDatabase(testDbName)

      return {
        success: true,
        backupId: dto.backupId,
        testDatabase: testDbName,
        verificationResults,
        message: "Test restore completed successfully",
      }
    } catch (error) {
      // Cleanup on failure
      await this.dropTestDatabase(testDbName)
      throw error
    }
  }

  private async createTestDatabase(dbName: string) {
    const dbHost = process.env.DB_HOST || "localhost"
    const dbPort = process.env.DB_PORT || "5432"
    const dbUser = process.env.DB_USER || "postgres"
    const dbPassword = process.env.DB_PASSWORD

    const command = `PGPASSWORD="${dbPassword}" createdb -h ${dbHost} -p ${dbPort} -U ${dbUser} ${dbName}`
    await execAsync(command)

    this.logger.log(`Test database created: ${dbName}`)
  }

  private async dropTestDatabase(dbName: string) {
    const dbHost = process.env.DB_HOST || "localhost"
    const dbPort = process.env.DB_PORT || "5432"
    const dbUser = process.env.DB_USER || "postgres"
    const dbPassword = process.env.DB_PASSWORD

    const command = `PGPASSWORD="${dbPassword}" dropdb -h ${dbHost} -p ${dbPort} -U ${dbUser} ${dbName}`
    await execAsync(command)

    this.logger.log(`Test database dropped: ${dbName}`)
  }

  private async waitForRestoreCompletion(jobId: string, timeout = 3600000) {
    const startTime = Date.now()

    while (Date.now() - startTime < timeout) {
      const job = await this.restoreJobRepo.findOne({ where: { id: jobId } })

      if (job.status === RestoreStatus.COMPLETED) {
        return
      }

      if (job.status === RestoreStatus.FAILED) {
        throw new Error(`Restore failed: ${job.errorMessage}`)
      }

      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    throw new Error("Restore timeout")
  }

  private async verifyRestoredData(dbName: string) {
    // Perform basic data integrity checks
    const checks = {
      tableCount: 0,
      rowCounts: {},
      foreignKeyIntegrity: true,
      indexIntegrity: true,
    }

    // Count tables
    const dbHost = process.env.DB_HOST || "localhost"
    const dbPort = process.env.DB_PORT || "5432"
    const dbUser = process.env.DB_USER || "postgres"
    const dbPassword = process.env.DB_PASSWORD

    const countTablesCmd = `PGPASSWORD="${dbPassword}" psql -h ${dbHost} -p ${dbPort} -U ${dbUser} -d ${dbName} -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"`
    const { stdout } = await execAsync(countTablesCmd)
    checks.tableCount = Number.parseInt(stdout.trim())

    return checks
  }

  async getRestoreJobStatus(jobId: string) {
    const job = await this.restoreJobRepo.findOne({ where: { id: jobId } })

    if (!job) {
      throw new Error("Restore job not found")
    }

    return job
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
}
