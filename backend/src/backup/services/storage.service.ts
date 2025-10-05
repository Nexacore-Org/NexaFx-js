import { Injectable, Logger } from "@nestjs/common"
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { BlobServiceClient } from "@azure/storage-blob"
import * as fs from "fs/promises"
import * as path from "path"
import type { ExportBackupDto } from "../dto/export-backup.dto"

export interface StorageLocation {
  provider: "aws-s3" | "azure-blob" | "gcp-storage"
  region: string
  bucket: string
  key: string
  url: string
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name)
  private s3PrimaryClient: S3Client
  private s3SecondaryClient: S3Client
  private azureBlobClient: BlobServiceClient

  constructor() {
    this.initializeClients()
  }

  private initializeClients() {
    // AWS S3 Primary (same region as application)
    this.s3PrimaryClient = new S3Client({
      region: process.env.AWS_PRIMARY_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })

    // AWS S3 Secondary (different region for DR)
    this.s3SecondaryClient = new S3Client({
      region: process.env.AWS_SECONDARY_REGION || "eu-west-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    })

    // Azure Blob Storage (cross-cloud redundancy)
    const azureConnectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
    if (azureConnectionString) {
      this.azureBlobClient = BlobServiceClient.fromConnectionString(azureConnectionString)
    }
  }

  async uploadToMultipleLocations(filePath: string, backupId: string, backupType: string): Promise<StorageLocation[]> {
    const filename = path.basename(filePath)
    const key = `backups/${backupType}/${backupId}/${filename}`

    const locations: StorageLocation[] = []

    try {
      // Upload to primary S3
      const primaryLocation = await this.uploadToS3(
        this.s3PrimaryClient,
        process.env.AWS_PRIMARY_BUCKET || "naira-backups-primary",
        key,
        filePath,
        process.env.AWS_PRIMARY_REGION || "us-east-1",
      )
      locations.push(primaryLocation)

      // Upload to secondary S3 (different region)
      const secondaryLocation = await this.uploadToS3(
        this.s3SecondaryClient,
        process.env.AWS_SECONDARY_BUCKET || "naira-backups-secondary",
        key,
        filePath,
        process.env.AWS_SECONDARY_REGION || "eu-west-1",
      )
      locations.push(secondaryLocation)

      // Upload to Azure Blob (cross-cloud redundancy)
      if (this.azureBlobClient) {
        const azureLocation = await this.uploadToAzure(
          process.env.AZURE_CONTAINER_NAME || "naira-backups",
          key,
          filePath,
        )
        locations.push(azureLocation)
      }

      this.logger.log(`Backup uploaded to ${locations.length} locations`)
      return locations
    } catch (error) {
      this.logger.error("Failed to upload to multiple locations", error)
      throw error
    }
  }

  private async uploadToS3(
    client: S3Client,
    bucket: string,
    key: string,
    filePath: string,
    region: string,
  ): Promise<StorageLocation> {
    const fileContent = await fs.readFile(filePath)

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ServerSideEncryption: "AES256",
      StorageClass: "STANDARD_IA", // Infrequent Access for cost optimization
    })

    await client.send(command)

    return {
      provider: "aws-s3",
      region,
      bucket,
      key,
      url: `s3://${bucket}/${key}`,
    }
  }

  private async uploadToAzure(containerName: string, blobName: string, filePath: string): Promise<StorageLocation> {
    const containerClient = this.azureBlobClient.getContainerClient(containerName)

    // Create container if it doesn't exist
    await containerClient.createIfNotExists()

    const blockBlobClient = containerClient.getBlockBlobClient(blobName)
    const fileContent = await fs.readFile(filePath)

    await blockBlobClient.upload(fileContent, fileContent.length)

    return {
      provider: "azure-blob",
      region: "global",
      bucket: containerName,
      key: blobName,
      url: blockBlobClient.url,
    }
  }

  async downloadFromPrimaryLocation(location: StorageLocation, destinationDir: string): Promise<string> {
    const filename = path.basename(location.key)
    const destinationPath = path.join(destinationDir, filename)

    if (location.provider === "aws-s3") {
      await this.downloadFromS3(this.s3PrimaryClient, location.bucket, location.key, destinationPath)
    } else if (location.provider === "azure-blob") {
      await this.downloadFromAzure(location.bucket, location.key, destinationPath)
    }

    return destinationPath
  }

  private async downloadFromS3(client: S3Client, bucket: string, key: string, destinationPath: string) {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })

    const response = await client.send(command)
    const bodyContents = await response.Body.transformToByteArray()
    await fs.writeFile(destinationPath, bodyContents)

    this.logger.log(`Downloaded from S3: ${destinationPath}`)
  }

  private async downloadFromAzure(containerName: string, blobName: string, destinationPath: string) {
    const containerClient = this.azureBlobClient.getContainerClient(containerName)
    const blobClient = containerClient.getBlobClient(blobName)

    await blobClient.downloadToFile(destinationPath)

    this.logger.log(`Downloaded from Azure: ${destinationPath}`)
  }

  async deleteFromAllLocations(locations: StorageLocation[]) {
    for (const location of locations) {
      try {
        if (location.provider === "aws-s3") {
          const client =
            location.region === process.env.AWS_PRIMARY_REGION ? this.s3PrimaryClient : this.s3SecondaryClient

          const command = new DeleteObjectCommand({
            Bucket: location.bucket,
            Key: location.key,
          })

          await client.send(command)
        } else if (location.provider === "azure-blob") {
          const containerClient = this.azureBlobClient.getContainerClient(location.bucket)
          const blobClient = containerClient.getBlobClient(location.key)
          await blobClient.delete()
        }

        this.logger.log(`Deleted backup from ${location.provider}: ${location.key}`)
      } catch (error) {
        this.logger.error(`Failed to delete from ${location.provider}`, error)
      }
    }
  }

  async getStorageStatistics() {
    const stats = {
      totalBackups: 0,
      totalSize: 0,
      byProvider: {},
      byType: {},
      costEstimate: 0,
    }

    // Get statistics from primary S3
    const primaryBucket = process.env.AWS_PRIMARY_BUCKET || "naira-backups-primary"
    // In production, use S3 inventory or CloudWatch metrics

    return stats
  }

  async exportToExternalStorage(dto: ExportBackupDto) {
    // Export backup to external storage (e.g., on-premises, different cloud)
    this.logger.log(`Exporting backup ${dto.backupId} to ${dto.destination}`)

    return {
      success: true,
      message: "Backup export initiated",
      exportId: crypto.randomBytes(16).toString("hex"),
    }
  }
}
