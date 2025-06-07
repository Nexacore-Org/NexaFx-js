import { Injectable } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"

export interface BackupConfiguration {
  path: string
  encryptionKey: string
  compressionLevel: number
  maxSize: number
  defaultRetention: number
  scheduledEnabled: boolean
  cleanupEnabled: boolean
  apiKeys: string[]
  storageOptions: {
    local: boolean
    s3?: {
      bucket: string
      region: string
      accessKeyId: string
      secretAccessKey: string
    }
    gcs?: {
      bucket: string
      projectId: string
      keyFilename: string
    }
  }
}

@Injectable()
export class BackupConfigService {
  private readonly config: BackupConfiguration

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfiguration()
  }

  getConfiguration(): BackupConfiguration {
    return { ...this.config }
  }

  updateConfiguration(updates: Partial<BackupConfiguration>): void {
    Object.assign(this.config, updates)
  }

  private loadConfiguration(): BackupConfiguration {
    return {
      path: this.configService.get<string>("BACKUP_PATH", "./backups"),
      encryptionKey: this.configService.get<string>("BACKUP_ENCRYPTION_KEY", this.generateDefaultKey()),
      compressionLevel: this.configService.get<number>("BACKUP_COMPRESSION_LEVEL", 6),
      maxSize: this.configService.get<number>("BACKUP_MAX_SIZE", 1024 * 1024 * 1024), // 1GB
      defaultRetention: this.configService.get<number>("BACKUP_DEFAULT_RETENTION", 30),
      scheduledEnabled: this.configService.get<boolean>("BACKUP_SCHEDULED_ENABLED", true),
      cleanupEnabled: this.configService.get<boolean>("BACKUP_CLEANUP_ENABLED", true),
      apiKeys: this.configService
        .get<string>("BACKUP_API_KEYS", "")
        .split(",")
        .filter((key) => key.trim().length > 0),
      storageOptions: {
        local: true,
        s3: this.configService.get<string>("BACKUP_S3_BUCKET")
          ? {
              bucket: this.configService.get<string>("BACKUP_S3_BUCKET")!,
              region: this.configService.get<string>("BACKUP_S3_REGION", "us-east-1"),
              accessKeyId: this.configService.get<string>("BACKUP_S3_ACCESS_KEY_ID")!,
              secretAccessKey: this.configService.get<string>("BACKUP_S3_SECRET_ACCESS_KEY")!,
            }
          : undefined,
        gcs: this.configService.get<string>("BACKUP_GCS_BUCKET")
          ? {
              bucket: this.configService.get<string>("BACKUP_GCS_BUCKET")!,
              projectId: this.configService.get<string>("BACKUP_GCS_PROJECT_ID")!,
              keyFilename: this.configService.get<string>("BACKUP_GCS_KEY_FILENAME")!,
            }
          : undefined,
      },
    }
  }

  private generateDefaultKey(): string {
    return "default-backup-encryption-key-32-chars"
  }
}
