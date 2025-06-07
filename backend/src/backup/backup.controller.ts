import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiSecurity } from "@nestjs/swagger"
import type { BackupService, BackupOptions, RestoreOptions } from "./backup.service"
import { SessionGuard } from "../session/guards/session.guard"
import { CurrentSession } from "../session/decorators/current-session.decorator"
import type { SessionData } from "../session/session.service"
import { AdminGuard } from "./guards/admin.guard"

@ApiTags("Backup & Restore")
@Controller("backup")
@UseGuards(SessionGuard, AdminGuard)
@ApiBearerAuth()
@ApiSecurity("api-key")
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Post("create")
  @ApiOperation({ summary: "Create a new backup" })
  @ApiResponse({ status: 201, description: "Backup created successfully" })
  @ApiResponse({ status: 400, description: "Invalid backup options" })
  @ApiResponse({ status: 403, description: "Insufficient permissions" })
  async createBackup(@Body() options: BackupOptions, @CurrentSession() session: SessionData) {
    // Validate backup options
    if (!["database", "files", "full"].includes((options as any).type)) {
      throw new BadRequestException("Invalid backup type. Must be 'database', 'files', or 'full'")
    }

    if (options.retention && (options.retention < 1 || options.retention > 365)) {
      throw new BadRequestException("Retention period must be between 1 and 365 days")
    }

    const metadata = await this.backupService.createBackup(options)

    return {
      message: "Backup created successfully",
      backup: {
        id: metadata.id,
        type: metadata.type,
        filename: metadata.filename,
        size: metadata.size,
        compressed: metadata.compressed,
        encrypted: metadata.encrypted,
        createdAt: metadata.createdAt,
        expiresAt: metadata.expiresAt,
        description: metadata.description,
        tags: metadata.tags,
      },
      createdBy: session.username,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("restore")
  @ApiOperation({ summary: "Restore from a backup" })
  @ApiResponse({ status: 200, description: "Backup restored successfully" })
  @ApiResponse({ status: 400, description: "Invalid restore options" })
  @ApiResponse({ status: 404, description: "Backup not found" })
  async restoreBackup(@Body() options: RestoreOptions, @CurrentSession() session: SessionData) {
    if (!options.backupId) {
      throw new BadRequestException("Backup ID is required")
    }

    const result = await this.backupService.restoreBackup(options)

    return {
      ...result,
      restoredBy: session.username,
      timestamp: new Date().toISOString(),
    }
  }

  @Get("list")
  @ApiOperation({ summary: "List all backups" })
  @ApiResponse({ status: 200, description: "Backups retrieved successfully" })
  @ApiQuery({ name: "type", required: false, description: "Filter by backup type" })
  @ApiQuery({ name: "tags", required: false, description: "Filter by tags (comma-separated)" })
  @ApiQuery({ name: "dateFrom", required: false, description: "Filter from date (ISO string)" })
  @ApiQuery({ name: "dateTo", required: false, description: "Filter to date (ISO string)" })
  @ApiQuery({ name: "limit", required: false, description: "Limit number of results" })
  async listBackups(
    @Query("type") type?: string,
    @Query("tags") tags?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("limit") limit?: string,
  ) {
    const filters: any = {}

    if (type) {
      filters.type = type
    }

    if (tags) {
      filters.tags = tags.split(",").map((tag) => tag.trim())
    }

    if (dateFrom) {
      filters.dateFrom = new Date(dateFrom)
    }

    if (dateTo) {
      filters.dateTo = new Date(dateTo)
    }

    if (limit) {
      const limitNum = Number.parseInt(limit)
      if (limitNum > 0 && limitNum <= 100) {
        filters.limit = limitNum
      }
    }

    const backups = await this.backupService.listBackups(filters)

    return {
      backups: backups.map((backup) => ({
        id: backup.id,
        type: backup.type,
        filename: backup.filename,
        size: backup.size,
        compressed: backup.compressed,
        encrypted: backup.encrypted,
        createdAt: backup.createdAt,
        expiresAt: backup.expiresAt,
        description: backup.description,
        tags: backup.tags,
        version: backup.version,
        source: backup.source,
      })),
      total: backups.length,
      filters,
      timestamp: new Date().toISOString(),
    }
  }

  @Get(":backupId")
  @ApiOperation({ summary: "Get backup details" })
  @ApiResponse({ status: 200, description: "Backup details retrieved" })
  @ApiResponse({ status: 404, description: "Backup not found" })
  async getBackup(@Param("backupId") backupId: string) {
    const backup = await this.backupService.getBackupById(backupId)

    if (!backup) {
      throw new BadRequestException("Backup not found")
    }

    return {
      backup: {
        id: backup.id,
        type: backup.type,
        filename: backup.filename,
        size: backup.size,
        compressed: backup.compressed,
        encrypted: backup.encrypted,
        checksum: backup.checksum,
        createdAt: backup.createdAt,
        expiresAt: backup.expiresAt,
        description: backup.description,
        tags: backup.tags,
        version: backup.version,
        source: backup.source,
      },
      timestamp: new Date().toISOString(),
    }
  }

  @Delete(":backupId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete a backup" })
  @ApiResponse({ status: 204, description: "Backup deleted successfully" })
  @ApiResponse({ status: 404, description: "Backup not found" })
  async deleteBackup(@Param("backupId") backupId: string, @CurrentSession() session: SessionData) {
    await this.backupService.deleteBackup(backupId)

    return {
      message: "Backup deleted successfully",
      backupId,
      deletedBy: session.username,
      timestamp: new Date().toISOString(),
    }
  }

  @Get("statistics/overview")
  @ApiOperation({ summary: "Get backup statistics" })
  @ApiResponse({ status: 200, description: "Backup statistics retrieved" })
  async getStatistics() {
    const statistics = await this.backupService.getBackupStatistics()

    return {
      statistics,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("validate/:backupId")
  @ApiOperation({ summary: "Validate backup integrity" })
  @ApiResponse({ status: 200, description: "Backup validation completed" })
  @ApiResponse({ status: 404, description: "Backup not found" })
  async validateBackup(@Param("backupId") backupId: string) {
    const validation = await this.backupService.validateBackup(backupId)

    return {
      backupId,
      validation,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("cleanup/expired")
  @ApiOperation({ summary: "Cleanup expired backups" })
  @ApiResponse({ status: 200, description: "Cleanup completed" })
  async cleanupExpiredBackups(@CurrentSession() session: SessionData) {
    const cleanedCount = await this.backupService.cleanupExpiredBackups()

    return {
      message: `Cleaned up ${cleanedCount} expired backups`,
      cleanedCount,
      triggeredBy: session.username,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("schedule/database")
  @ApiOperation({ summary: "Trigger scheduled database backup" })
  @ApiResponse({ status: 200, description: "Scheduled backup triggered" })
  async triggerDatabaseBackup(@CurrentSession() session: SessionData) {
    await this.backupService.scheduledDatabaseBackup()

    return {
      message: "Database backup triggered successfully",
      triggeredBy: session.username,
      timestamp: new Date().toISOString(),
    }
  }

  @Post("schedule/full")
  @ApiOperation({ summary: "Trigger scheduled full backup" })
  @ApiResponse({ status: 200, description: "Scheduled full backup triggered" })
  async triggerFullBackup(@CurrentSession() session: SessionData) {
    await this.backupService.scheduledFullBackup()

    return {
      message: "Full backup triggered successfully",
      triggeredBy: session.username,
      timestamp: new Date().toISOString(),
    }
  }

  @Get("health")
  @ApiOperation({ summary: "Health check for backup service" })
  healthCheck() {
    return {
      status: "healthy",
      timestamp: new Date().toISOString(),
      service: "backup-restore",
    }
  }
}
