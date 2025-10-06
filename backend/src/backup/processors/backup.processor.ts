import { Processor, Process } from "@nestjs/bull"
import type { Job } from "bull"
import { Logger } from "@nestjs/common"
import type { BackupService, BackupType } from "../services/backup.service"

@Processor("backup")
export class BackupProcessor {
  private readonly logger = new Logger(BackupProcessor.name)

  constructor(private readonly backupService: BackupService) {}

  @Process("perform-backup")
  async handleBackup(job: Job) {
    const { backupId, type } = job.data

    this.logger.log(`Processing backup job: ${backupId} (${type})`)

    try {
      await this.backupService.performBackup(backupId, type as BackupType)
      this.logger.log(`Backup job completed: ${backupId}`)
    } catch (error) {
      this.logger.error(`Backup job failed: ${backupId}`, error)
      throw error
    }
  }
}
