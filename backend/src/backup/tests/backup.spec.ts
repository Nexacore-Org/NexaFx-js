import { Test, type TestingModule } from "@nestjs/testing"
import { ConfigService } from "@nestjs/config"
import { BackupService } from "../backup.service"
import { jest } from "@jest/globals"

describe("BackupService", () => {
  let service: BackupService
  let configService: ConfigService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                BACKUP_PATH: "./test-backups",
                BACKUP_ENCRYPTION_KEY: "test-encryption-key-32-characters",
                BACKUP_COMPRESSION_LEVEL: 6,
                BACKUP_MAX_SIZE: 1024 * 1024, // 1MB for testing
                BACKUP_DEFAULT_RETENTION: 7, // 7 days for testing
                BACKUP_SCHEDULED_ENABLED: false, // Disable for testing
                BACKUP_CLEANUP_ENABLED: false, // Disable for testing
              }
              return config[key] || defaultValue
            }),
          },
        },
      ],
    }).compile()

    service = module.get<BackupService>(BackupService)
    configService = module.get<ConfigService>(ConfigService)
  })

  it("should be defined", () => {
    expect(service).toBeDefined()
  })

  describe("createBackup", () => {
    it("should create a database backup", async () => {
      const options = {
        type: "database" as const,
        description: "Test database backup",
        tags: ["test", "database"],
      }

      const metadata = await service.createBackup(options)

      expect(metadata).toBeDefined()
      expect(metadata.type).toBe("database")
      expect(metadata.description).toBe("Test database backup")
      expect(metadata.tags).toEqual(["test", "database"])
      expect(metadata.compressed).toBe(true)
      expect(metadata.encrypted).toBe(true)
      expect(metadata.size).toBeGreaterThan(0)
      expect(metadata.checksum).toBeDefined()
    })

    it("should create a files backup", async () => {
      const options = {
        type: "files" as const,
        compress: false,
        encrypt: false,
      }

      const metadata = await service.createBackup(options)

      expect(metadata.type).toBe("files")
      expect(metadata.compressed).toBe(false)
      expect(metadata.encrypted).toBe(false)
    })

    it("should create a full backup", async () => {
      const options = {
        type: "full" as const,
        retention: 14,
      }

      const metadata = await service.createBackup(options)

      expect(metadata.type).toBe("full")
      expect(metadata.expiresAt).toBeDefined()

      const retentionDays = Math.floor(
        (metadata.expiresAt!.getTime() - metadata.createdAt.getTime()) / (24 * 60 * 60 * 1000),
      )
      expect(retentionDays).toBe(14)
    })

    it("should reject invalid backup type", async () => {
      const options = {
        type: "invalid" as any,
      }

      await expect(service.createBackup(options)).rejects.toThrow("Invalid backup type")
    })
  })

  describe("listBackups", () => {
    beforeEach(async () => {
      // Create some test backups
      await service.createBackup({ type: "database", tags: ["daily"] })
      await service.createBackup({ type: "files", tags: ["weekly"] })
      await service.createBackup({ type: "full", tags: ["monthly"] })
    })

    it("should list all backups", async () => {
      const backups = await service.listBackups()
      expect(backups.length).toBe(3)
    })

    it("should filter backups by type", async () => {
      const backups = await service.listBackups({ type: "database" })
      expect(backups.length).toBe(1)
      expect(backups[0].type).toBe("database")
    })

    it("should filter backups by tags", async () => {
      const backups = await service.listBackups({ tags: ["daily"] })
      expect(backups.length).toBe(1)
      expect(backups[0].tags).toContain("daily")
    })

    it("should limit results", async () => {
      const backups = await service.listBackups({ limit: 2 })
      expect(backups.length).toBe(2)
    })
  })

  describe("validateBackup", () => {
    it("should validate a valid backup", async () => {
      const metadata = await service.createBackup({ type: "database" })
      const validation = await service.validateBackup(metadata.id)

      expect(validation.valid).toBe(true)
      expect(validation.issues).toHaveLength(0)
    })

    it("should detect invalid backup", async () => {
      const validation = await service.validateBackup("non-existent-id")

      expect(validation.valid).toBe(false)
      expect(validation.issues).toContain("Backup metadata not found")
    })
  })

  describe("restoreBackup", () => {
    it("should restore a database backup", async () => {
      const metadata = await service.createBackup({ type: "database" })
      const result = await service.restoreBackup({
        backupId: metadata.id,
        validateChecksum: true,
      })

      expect(result.success).toBe(true)
      expect(result.message).toBe("Backup restored successfully")
      expect(result.details).toBeDefined()
    })

    it("should fail to restore non-existent backup", async () => {
      await expect(
        service.restoreBackup({
          backupId: "non-existent-id",
        }),
      ).rejects.toThrow("Backup not found")
    })
  })

  describe("deleteBackup", () => {
    it("should delete a backup", async () => {
      const metadata = await service.createBackup({ type: "database" })
      await service.deleteBackup(metadata.id)

      const backup = await service.getBackupById(metadata.id)
      expect(backup).toBeNull()
    })

    it("should fail to delete non-existent backup", async () => {
      await expect(service.deleteBackup("non-existent-id")).rejects.toThrow("Backup not found")
    })
  })

  describe("getBackupStatistics", () => {
    beforeEach(async () => {
      await service.createBackup({ type: "database" })
      await service.createBackup({ type: "files" })
    })

    it("should return backup statistics", async () => {
      const stats = await service.getBackupStatistics()

      expect(stats.totalBackups).toBe(2)
      expect(stats.totalSize).toBeGreaterThan(0)
      expect(stats.backupsByType.database).toBe(1)
      expect(stats.backupsByType.files).toBe(1)
      expect(stats.storageUsage).toBeDefined()
      expect(stats.retentionStatus).toBeDefined()
    })
  })

  describe("cleanupExpiredBackups", () => {
    it("should cleanup expired backups", async () => {
      // Create a backup with very short retention
      const metadata = await service.createBackup({ type: "database", retention: 1 })

      // Manually expire the backup
      metadata.expiresAt = new Date(Date.now() - 1000)
      await (service as any).backupMetadata.set(metadata.id, metadata)

      const cleanedCount = await service.cleanupExpiredBackups()
      expect(cleanedCount).toBe(1)

      const backup = await service.getBackupById(metadata.id)
      expect(backup).toBeNull()
    })
  })
})
