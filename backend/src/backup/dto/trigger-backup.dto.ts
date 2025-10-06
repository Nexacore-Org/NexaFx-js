import { IsEnum, IsOptional, IsString } from "class-validator"
import { BackupType } from "../services/backup.service"

export class TriggerBackupDto {
  @IsEnum(BackupType)
  type: BackupType

  @IsOptional()
  @IsString()
  triggeredBy?: string
}
