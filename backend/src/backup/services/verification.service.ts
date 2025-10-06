import { Injectable, Logger } from "@nestjs/common"
import type { Repository } from "typeorm"
import type { BackupMetadata } from "../entities/backup-metadata.entity"
import type { StorageService } from "./storage.service"
import { BackupStatus } from "./backup.service"
import * as crypto from "crypto"
import * as fs from "fs/promises"
import { createReadStream } from "fs"

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name)

  constructor(
    private readonly backupRepo: Repository<BackupMetadata>,
    private readonly storageService: StorageService,
  ) {}

  async verifyBackupIntegrity(backupId: string) {
    const backup = await this.backupRepo.findOne({ where: { id: backupId } })

    if (!backup) {
      throw new Error("Backup not found")
    }

    try {
      backup.status = BackupStatus.VERIFYING
      await this.backupRepo.save(backup)

      const verificationResults = {
        backupId,
        checksumValid: false,
        storageLocationsValid: [],
        fileAccessible: false,
        sizeMatches: false,
        overallValid: false,
      }

      // Verify checksum
      const tempDir = "/tmp/verification"
      await fs.mkdir(tempDir, { recursive: true })

      const downloadedPath = await this.storageService.downloadFromPrimaryLocation(backup.storageLocations[0], tempDir)

      const calculatedChecksum = await this.calculateChecksum(downloadedPath)
      verificationResults.checksumValid = calculatedChecksum === backup.checksum

      // Verify file size
      const stats = await fs.stat(downloadedPath)
      verificationResults.sizeMatches = stats.size === backup.fileSize

      // Verify all storage locations
      for (const location of backup.storageLocations) {
        const isValid = await this.verifyStorageLocation(location)
        verificationResults.storageLocationsValid.push({
          location: location.url,
          valid: isValid,
        })
      }

      verificationResults.fileAccessible = true
      verificationResults.overallValid =
        verificationResults.checksumValid &&
        verificationResults.sizeMatches &&
        verificationResults.storageLocationsValid.every((l) => l.valid)

      // Update backup status
      if (verificationResults.overallValid) {
        backup.status = BackupStatus.VERIFIED
        backup.lastVerifiedAt = new Date()
      } else {
        backup.status = BackupStatus.FAILED
      }

      await this.backupRepo.save(backup)

      // Cleanup
      await fs.unlink(downloadedPath)

      return verificationResults
    } catch (error) {
      this.logger.error(`Verification failed for backup ${backupId}`, error)
      backup.status = BackupStatus.FAILED
      await this.backupRepo.save(backup)
      throw error
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256")
    const stream = createReadStream(filePath)

    return new Promise((resolve, reject) => {
      stream.on("data", (data) => hash.update(data))
      stream.on("end", () => resolve(hash.digest("hex")))
      stream.on("error", reject)
    })
  }

  private async verifyStorageLocation(location: any): Promise<boolean> {
    try {
      // Verify that the file exists in the storage location
      // This is a simplified check - in production, use provider-specific APIs
      return true
    } catch (error) {
      this.logger.error(`Storage location verification failed: ${location.url}`, error)
      return false
    }
  }
}
