import { ApiProperty } from "@nestjs/swagger"
import { IsString, IsBoolean, IsNumber, IsArray, IsOptional, IsIn, Min, Max } from "class-validator"

export class CreateBackupDto {
  @ApiProperty({ description: "Type of backup", enum: ["database", "files", "full"] })
  @IsString()
  @IsIn(["database", "files", "full"])
  type: "database" | "files" | "full"

  @ApiProperty({ description: "Compress the backup", required: false, default: true })
  @IsOptional()
  @IsBoolean()
  compress?: boolean

  @ApiProperty({ description: "Encrypt the backup", required: false, default: true })
  @IsOptional()
  @IsBoolean()
  encrypt?: boolean

  @ApiProperty({ description: "Backup description", required: false })
  @IsOptional()
  @IsString()
  description?: string

  @ApiProperty({ description: "Backup tags", required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @ApiProperty({ description: "Retention period in days", required: false, minimum: 1, maximum: 365 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(365)
  retention?: number

  @ApiProperty({ description: "Backup destination", required: false })
  @IsOptional()
  @IsString()
  destination?: string
}

export class RestoreBackupDto {
  @ApiProperty({ description: "Backup ID to restore from" })
  @IsString()
  backupId: string

  @ApiProperty({ description: "Restore destination", required: false })
  @IsOptional()
  @IsString()
  destination?: string

  @ApiProperty({ description: "Overwrite existing data", required: false, default: false })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean

  @ApiProperty({ description: "Validate backup checksum", required: false, default: true })
  @IsOptional()
  @IsBoolean()
  validateChecksum?: boolean
}

export class BackupFilterDto {
  @ApiProperty({ description: "Filter by backup type", required: false })
  @IsOptional()
  @IsString()
  @IsIn(["database", "files", "full"])
  type?: string

  @ApiProperty({ description: "Filter by tags (comma-separated)", required: false })
  @IsOptional()
  @IsString()
  tags?: string

  @ApiProperty({ description: "Filter from date (ISO string)", required: false })
  @IsOptional()
  @IsString()
  dateFrom?: string

  @ApiProperty({ description: "Filter to date (ISO string)", required: false })
  @IsOptional()
  @IsString()
  dateTo?: string

  @ApiProperty({ description: "Limit number of results", required: false, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number
}
