import { Injectable, Logger, BadRequestException, InternalServerErrorException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import { Cron, CronExpression } from "@nestjs/schedule"
import { createCipher, createDecipher, randomBytes, createHash } from "crypto"
import { promises as fs } from "fs"
import { join } from "path"
import { createGzip, createGunzip } from "zlib"

export interface BackupMetadata {
  id: string
  type: "database" | "files" | "full"
  filename: string
  size: number
  compressed: boolean
  encrypted: boolean
  checksum: string
  createdAt: Date
  expiresAt?: Date
  description?: string
  tags?: string[]
  version: string
  source: string
}

export interface BackupOptions {
  type: "database" | "files" | "full"
  compress?: boolean
  encrypt?: boolean
  description?: string
  tags?: string[]
  retention?: number // days
  destination?: string
}

export interface RestoreOptions {
  backupId: string
  destination?: string
  overwrite?: boolean
  validateChecksum?: boolean
}

export interface BackupStatistics {
  totalBackups: number
  totalSize: number
  successfulBackups: number
  failedBackups: number
  lastBackupTime?: Date
  nextScheduledBackup?: Date
  storageUsage: {
    used: number
    available: number
    percentage: number
  }
  backupsByType: Record<string, number>
  retentionStatus: {
    expiredBackups: number
    backupsToExpire: Array<{ id: string; expiresAt: Date }>
  }
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name)
  private readonly backupPath: string
  private readonly encryptionKey: string
  private readonly compressionLevel: number
  private readonly maxBackupSize: number
  private readonly defaultRetention: number
  private readonly backupMetadata = new Map<string, BackupMetadata>()

  constructor(private readonly configService: ConfigService) {
    this.backupPath = this.configService.get<string>("BACKUP_PATH", "./backups")
    this.encryptionKey = this.configService.get<string>("BACKUP_ENCRYPTION_KEY", this.generateEncryptionKey())
    this.compressionLevel = this.configService.get<number>("BACKUP_COMPRESSION_LEVEL", 6)
    this.maxBackupSize = this.configService.get<number>("BACKUP_MAX_SIZE", 1024 * 1024 * 1024) // 1GB
    this.defaultRetention = this.configService.get<number>("BACKUP_DEFAULT_RETENTION", 30) // 30 days

    this.initializeBackupDirectory()
    this.loadBackupMetadata()
  }

  async createBackup(options: BackupOptions): Promise<BackupMetadata> {
    this.logger.log(`Starting backup creation: ${options.type}`)

    try {
      const backupId = this.generateBackupId()
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
      const filename = `backup-${options.type}-${timestamp}-${backupId.substring(0, 8)}`

      let backupData: Buffer
      let source: string

      switch (options.type) {
        case "database":
          backupData = await this.createDatabaseBackup()
          source = "database"
          break
        case "files":
          backupData = await this.createFilesBackup()
          source = "filesystem"
          break
        case "full":
          backupData = await this.createFullBackup()
          source = "full-system"
          break
        default:
          throw new BadRequestException(`Invalid backup type: ${options.type}`)
      }

      // Validate backup size
      if (backupData.length > this.maxBackupSize) {
        throw new BadRequestException(`Backup size exceeds maximum allowed size: ${this.maxBackupSize} bytes`)
      }

      let processedData = backupData
      let finalFilename = filename

      // Compress if requested
      if (options.compress !== false) {
        processedData = await this.compressData(processedData)
        finalFilename += ".gz"
        this.logger.log(`Backup compressed: ${backupData.length} -> ${processedData.length} bytes`)
      }

      // Encrypt if requested
      if (options.encrypt !== false) {
        processedData = await this.encryptData(processedData)
        finalFilename += ".enc"
        this.logger.log("Backup encrypted")
      }

      // Calculate checksum
      const checksum = this.calculateChecksum(processedData)

      // Save to disk
      const backupFilePath = join(this.backupPath, finalFilename)
      await fs.writeFile(backupFilePath, processedData)

      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        type: options.type,
        filename: finalFilename,
        size: processedData.length,
        compressed: options.compress !== false,
        encrypted: options.encrypt !== false,
        checksum,
        createdAt: new Date(),
        expiresAt: options.retention
          ? new Date(Date.now() + options.retention * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + this.defaultRetention * 24 * 60 * 60 * 1000),
        description: options.description,
        tags: options.tags || [],
        version: "1.0",
        source,
      }

      // Store metadata
      this.backupMetadata.set(backupId, metadata)
      await this.saveBackupMetadata()

      this.logger.log(`Backup created successfully: ${backupId}`)
      return metadata
    } catch (error) {
      this.logger.error(`Backup creation failed: ${error.message}`, error.stack)
      throw new InternalServerErrorException(`Backup creation failed: ${error.message}`)
    }
  }

  async restoreBackup(options: RestoreOptions): Promise<{ success: boolean; message: string; details?: any }> {
    this.logger.log(`Starting backup restoration: ${options.backupId}`)

    try {
      const metadata = this.backupMetadata.get(options.backupId)
      if (!metadata) {
        throw new BadRequestException(`Backup not found: ${options.backupId}`)
      }

      // Check if backup file exists
      const backupFilePath = join(this.backupPath, metadata.filename)
      const fileExists = await fs
        .access(backupFilePath)
        .then(() => true)
        .catch(() => false)

      if (!fileExists) {
        throw new BadRequestException(`Backup file not found: ${metadata.filename}`)
      }

      // Read backup data
      let backupData = await fs.readFile(backupFilePath)

      // Validate checksum if requested
      if (options.validateChecksum !== false) {
        const currentChecksum = this.calculateChecksum(backupData)
        if (currentChecksum !== metadata.checksum) {
          throw new BadRequestException("Backup file integrity check failed")
        }
      }

      // Decrypt if encrypted
      if (metadata.encrypted) {
        backupData = await this.decryptData(backupData)
        this.logger.log("Backup decrypted")
      }

      // Decompress if compressed
      if (metadata.compressed) {
        backupData = await this.decompressData(backupData)
        this.logger.log("Backup decompressed")
      }

      // Perform restoration based on backup type
      let restoreResult: any

      switch (metadata.type) {
        case "database":
          restoreResult = await this.restoreDatabase(backupData, options)
          break
        case "files":
          restoreResult = await this.restoreFiles(backupData, options)
          break
        case "full":
          restoreResult = await this.restoreFullBackup(backupData, options)
          break
        default:
          throw new BadRequestException(`Invalid backup type: ${metadata.type}`)
      }

      this.logger.log(`Backup restoration completed: ${options.backupId}`)
      return {
        success: true,
        message: "Backup restored successfully",
        details: restoreResult,
      }
    } catch (error) {
      this.logger.error(`Backup restoration failed: ${error.message}`, error.stack)
      throw new InternalServerErrorException(`Backup restoration failed: ${error.message}`)
    }
  }

  async listBackups(filters?: {
    type?: string
    tags?: string[]
    dateFrom?: Date
    dateTo?: Date
    limit?: number
  }): Promise<BackupMetadata[]> {
    let backups = Array.from(this.backupMetadata.values())

    // Apply filters
    if (filters?.type) {
      backups = backups.filter((backup) => backup.type === filters.type)
    }

    if (filters?.tags && filters.tags.length > 0) {
      backups = backups.filter((backup) => filters.tags!.some((tag) => backup.tags?.includes(tag)))
    }

    if (filters?.dateFrom) {
      backups = backups.filter((backup) => backup.createdAt >= filters.dateFrom!)
    }

    if (filters?.dateTo) {
      backups = backups.filter((backup) => backup.createdAt <= filters.dateTo!)
    }

    // Sort by creation date (newest first)
    backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Apply limit
    if (filters?.limit) {
      backups = backups.slice(0, filters.limit)
    }

    return backups
  }

  async getBackupById(backupId: string): Promise<BackupMetadata | null> {
    return this.backupMetadata.get(backupId) || null
  }

  async deleteBackup(backupId: string): Promise<void> {
    const metadata = this.backupMetadata.get(backupId)
    if (!metadata) {
      throw new BadRequestException(`Backup not found: ${backupId}`)
    }

    try {
      // Delete backup file
      const backupFilePath = join(this.backupPath, metadata.filename)
      await fs.unlink(backupFilePath).catch(() => {
        // File might already be deleted, log but don't fail
        this.logger.warn(`Backup file not found during deletion: ${metadata.filename}`)
      })

      // Remove from metadata
      this.backupMetadata.delete(backupId)
      await this.saveBackupMetadata()

      this.logger.log(`Backup deleted: ${backupId}`)
    } catch (error) {
      this.logger.error(`Failed to delete backup: ${error.message}`)
      throw new InternalServerErrorException(`Failed to delete backup: ${error.message}`)
    }
  }

  async getBackupStatistics(): Promise<BackupStatistics> {
    const backups = Array.from(this.backupMetadata.values())
    const now = new Date()

    const totalBackups = backups.length
    const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0)
    const successfulBackups = backups.length // All stored backups are considered successful
    const failedBackups = 0 // Would need to track this separately

    const lastBackup = backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
    const lastBackupTime = lastBackup?.createdAt

    // Calculate storage usage (simplified)
    const storageUsage = {
      used: totalSize,
      available: this.maxBackupSize * 10, // Assume 10x max backup size as available
      percentage: Math.round((totalSize / (this.maxBackupSize * 10)) * 100),
    }

    // Count backups by type
    const backupsByType = backups.reduce(
      (counts, backup) => {
        counts[backup.type] = (counts[backup.type] || 0) + 1
        return counts
      },
      {} as Record<string, number>,
    )

    // Find expired and soon-to-expire backups
    const expiredBackups = backups.filter((backup) => backup.expiresAt && backup.expiresAt <= now).length
    const backupsToExpire = backups
      .filter((backup) => {
        if (!backup.expiresAt) return false
        const daysUntilExpiry = (backup.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
        return daysUntilExpiry <= 7 && daysUntilExpiry > 0
      })
      .map((backup) => ({ id: backup.id, expiresAt: backup.expiresAt! }))

    return {
      totalBackups,
      totalSize,
      successfulBackups,
      failedBackups,
      lastBackupTime,
      nextScheduledBackup: this.getNextScheduledBackupTime(),
      storageUsage,
      backupsByType,
      retentionStatus: {
        expiredBackups,
        backupsToExpire,
      },
    }
  }

  async cleanupExpiredBackups(): Promise<number> {
    const now = new Date()
    const expiredBackups = Array.from(this.backupMetadata.values()).filter(
      (backup) => backup.expiresAt && backup.expiresAt <= now,
    )

    let cleanedCount = 0

    for (const backup of expiredBackups) {
      try {
        await this.deleteBackup(backup.id)
        cleanedCount++
      } catch (error) {
        this.logger.error(`Failed to cleanup expired backup ${backup.id}: ${error.message}`)
      }
    }

    this.logger.log(`Cleaned up ${cleanedCount} expired backups`)
    return cleanedCount
  }

  async validateBackup(backupId: string): Promise<{ valid: boolean; issues: string[] }> {
    const metadata = this.backupMetadata.get(backupId)
    if (!metadata) {
      return { valid: false, issues: ["Backup metadata not found"] }
    }

    const issues: string[] = []

    try {
      // Check if file exists
      const backupFilePath = join(this.backupPath, metadata.filename)
      const fileExists = await fs
        .access(backupFilePath)
        .then(() => true)
        .catch(() => false)

      if (!fileExists) {
        issues.push("Backup file not found")
        return { valid: false, issues }
      }

      // Check file size
      const stats = await fs.stat(backupFilePath)
      if (stats.size !== metadata.size) {
        issues.push(`File size mismatch: expected ${metadata.size}, got ${stats.size}`)
      }

      // Validate checksum
      const fileData = await fs.readFile(backupFilePath)
      const currentChecksum = this.calculateChecksum(fileData)
      if (currentChecksum !== metadata.checksum) {
        issues.push("Checksum validation failed")
      }

      // Check if backup is expired
      if (metadata.expiresAt && metadata.expiresAt <= new Date()) {
        issues.push("Backup has expired")
      }

      return { valid: issues.length === 0, issues }
    } catch (error) {
      issues.push(`Validation error: ${error.message}`)
      return { valid: false, issues }
    }
  }

  // Scheduled backup methods
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async scheduledDatabaseBackup(): Promise<void> {
    if (!this.configService.get<boolean>("BACKUP_SCHEDULED_ENABLED", true)) {
      return
    }

    try {
      this.logger.log("Starting scheduled database backup")
      await this.createBackup({
        type: "database",
        description: "Scheduled daily database backup",
        tags: ["scheduled", "daily", "database"],
      })
      this.logger.log("Scheduled database backup completed")
    } catch (error) {
      this.logger.error(`Scheduled database backup failed: ${error.message}`)
    }
  }

  @Cron(CronExpression.EVERY_SUNDAY_AT_3AM)
  async scheduledFullBackup(): Promise<void> {
    if (!this.configService.get<boolean>("BACKUP_SCHEDULED_ENABLED", true)) {
      return
    }

    try {
      this.logger.log("Starting scheduled full backup")
      await this.createBackup({
        type: "full",
        description: "Scheduled weekly full backup",
        tags: ["scheduled", "weekly", "full"],
      })
      this.logger.log("Scheduled full backup completed")
    } catch (error) {
      this.logger.error(`Scheduled full backup failed: ${error.message}`)
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async scheduledCleanup(): Promise<void> {
    if (!this.configService.get<boolean>("BACKUP_CLEANUP_ENABLED", true)) {
      return
    }

    try {
      this.logger.log("Starting scheduled backup cleanup")
      const cleanedCount = await this.cleanupExpiredBackups()
      this.logger.log(`Scheduled cleanup completed: ${cleanedCount} backups removed`)
    } catch (error) {
      this.logger.error(`Scheduled cleanup failed: ${error.message}`)
    }
  }

  // Private helper methods
  private async initializeBackupDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.backupPath, { recursive: true })
      this.logger.log(`Backup directory initialized: ${this.backupPath}`)
    } catch (error) {
      this.logger.error(`Failed to initialize backup directory: ${error.message}`)
      throw error
    }
  }

  private async loadBackupMetadata(): Promise<void> {
    try {
      const metadataPath = join(this.backupPath, "metadata.json")
      const metadataExists = await fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false)

      if (metadataExists) {
        const metadataContent = await fs.readFile(metadataPath, "utf-8")
        const metadata = JSON.parse(metadataContent)

        for (const [id, data] of Object.entries(metadata)) {
          this.backupMetadata.set(id, {
            ...data,
            createdAt: new Date((data as any).createdAt),
            expiresAt: (data as any).expiresAt ? new Date((data as any).expiresAt) : undefined,
          } as BackupMetadata)
        }

        this.logger.log(`Loaded ${this.backupMetadata.size} backup metadata entries`)
      }
    } catch (error) {
      this.logger.error(`Failed to load backup metadata: ${error.message}`)
    }
  }

  private async saveBackupMetadata(): Promise<void> {
    try {
      const metadataPath = join(this.backupPath, "metadata.json")
      const metadata = Object.fromEntries(this.backupMetadata.entries())
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
    } catch (error) {
      this.logger.error(`Failed to save backup metadata: ${error.message}`)
    }
  }

  private generateBackupId(): string {
    return randomBytes(16).toString("hex")
  }

  private generateEncryptionKey(): string {
    return randomBytes(32).toString("hex")
  }

  private calculateChecksum(data: Buffer): string {
    return createHash("sha256").update(data).digest("hex")
  }

  private async compressData(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const gzip = createGzip({ level: this.compressionLevel })

      gzip.on("data", (chunk) => chunks.push(chunk))
      gzip.on("end", () => resolve(Buffer.concat(chunks)))
      gzip.on("error", reject)

      gzip.write(data)
      gzip.end()
    })
  }

  private async decompressData(data: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const gunzip = createGunzip()

      gunzip.on("data", (chunk) => chunks.push(chunk))
      gunzip.on("end", () => resolve(Buffer.concat(chunks)))
      gunzip.on("error", reject)

      gunzip.write(data)
      gunzip.end()
    })
  }

  private async encryptData(data: Buffer): Promise<Buffer> {
    const cipher = createCipher("aes-256-cbc", this.encryptionKey)
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()])
    return encrypted
  }

  private async decryptData(data: Buffer): Promise<Buffer> {
    const decipher = createDecipher("aes-256-cbc", this.encryptionKey)
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
    return decrypted
  }

  private async createDatabaseBackup(): Promise<Buffer> {
    // Simulate database backup creation
    // In a real implementation, this would:
    // - Connect to the database
    // - Export schema and data
    // - Return the backup data as Buffer

    const mockDatabaseData = {
      schema: {
        users: {
          id: "INTEGER PRIMARY KEY",
          username: "VARCHAR(255) UNIQUE",
          email: "VARCHAR(255)",
          created_at: "TIMESTAMP",
        },
        sessions: {
          id: "VARCHAR(64) PRIMARY KEY",
          user_id: "INTEGER",
          data: "TEXT",
          expires_at: "TIMESTAMP",
        },
      },
      data: {
        users: [
          { id: 1, username: "admin", email: "admin@example.com", created_at: "2024-01-01T00:00:00Z" },
          { id: 2, username: "user", email: "user@example.com", created_at: "2024-01-02T00:00:00Z" },
        ],
        sessions: [
          {
            id: "session123",
            user_id: 1,
            data: '{"roles":["admin"]}',
            expires_at: "2024-12-31T23:59:59Z",
          },
        ],
      },
      metadata: {
        version: "1.0",
        exported_at: new Date().toISOString(),
        tables: ["users", "sessions"],
      },
    }

    return Buffer.from(JSON.stringify(mockDatabaseData, null, 2))
  }

  private async createFilesBackup(): Promise<Buffer> {
    // Simulate files backup creation
    // In a real implementation, this would:
    // - Archive important files and directories
    // - Create a tar/zip archive
    // - Return the archive data as Buffer

    const mockFilesData = {
      files: [
        {
          path: "/app/uploads/file1.jpg",
          size: 1024,
          modified: "2024-01-01T00:00:00Z",
          checksum: "abc123",
        },
        {
          path: "/app/config/app.json",
          size: 512,
          modified: "2024-01-02T00:00:00Z",
          checksum: "def456",
        },
      ],
      metadata: {
        total_files: 2,
        total_size: 1536,
        backup_type: "files",
        created_at: new Date().toISOString(),
      },
    }

    return Buffer.from(JSON.stringify(mockFilesData, null, 2))
  }

  private async createFullBackup(): Promise<Buffer> {
    // Simulate full system backup
    const [databaseBackup, filesBackup] = await Promise.all([this.createDatabaseBackup(), this.createFilesBackup()])

    const fullBackupData = {
      database: JSON.parse(databaseBackup.toString()),
      files: JSON.parse(filesBackup.toString()),
      metadata: {
        backup_type: "full",
        created_at: new Date().toISOString(),
        components: ["database", "files"],
      },
    }

    return Buffer.from(JSON.stringify(fullBackupData, null, 2))
  }

  private async restoreDatabase(data: Buffer, options: RestoreOptions): Promise<any> {
    // Simulate database restoration
    const backupData = JSON.parse(data.toString())

    this.logger.log("Restoring database...")
    this.logger.log(`Schema tables: ${Object.keys(backupData.schema).join(", ")}`)
    this.logger.log(`Data tables: ${Object.keys(backupData.data).join(", ")}`)

    // In a real implementation, this would:
    // - Validate the backup data structure
    // - Drop/recreate tables if overwrite is true
    // - Import schema and data
    // - Verify the restoration

    return {
      restoredTables: Object.keys(backupData.schema),
      restoredRecords: Object.values(backupData.data).reduce((sum: number, table: any) => sum + table.length, 0),
      restoredAt: new Date().toISOString(),
    }
  }

  private async restoreFiles(data: Buffer, options: RestoreOptions): Promise<any> {
    // Simulate files restoration
    const backupData = JSON.parse(data.toString())

    this.logger.log("Restoring files...")
    this.logger.log(`Total files: ${backupData.metadata.total_files}`)

    // In a real implementation, this would:
    // - Extract files from archive
    // - Restore to specified destination
    // - Verify file integrity
    // - Set proper permissions

    return {
      restoredFiles: backupData.files.length,
      totalSize: backupData.metadata.total_size,
      destination: options.destination || "/app",
      restoredAt: new Date().toISOString(),
    }
  }

  private async restoreFullBackup(data: Buffer, options: RestoreOptions): Promise<any> {
    // Simulate full backup restoration
    const backupData = JSON.parse(data.toString())

    this.logger.log("Restoring full backup...")

    const databaseResult = await this.restoreDatabase(Buffer.from(JSON.stringify(backupData.database)), options)
    const filesResult = await this.restoreFiles(Buffer.from(JSON.stringify(backupData.files)), options)

    return {
      database: databaseResult,
      files: filesResult,
      restoredAt: new Date().toISOString(),
    }
  }

  private getNextScheduledBackupTime(): Date {
    // Calculate next scheduled backup time (daily at 2 AM)
    const now = new Date()
    const nextBackup = new Date(now)
    nextBackup.setHours(2, 0, 0, 0)

    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1)
    }

    return nextBackup
  }
}
