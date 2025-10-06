import { IsString, IsEnum, IsOptional, IsBoolean } from "class-validator"
import { BackupType } from "../services/backup.service"

export class ConfigureScheduleDto {
  @IsString()
  name: string

  @IsString()
  cronExpression: string

  @IsEnum(BackupType)
  backupType: BackupType

  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}
