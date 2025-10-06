import { IsString, IsOptional, IsDateString } from "class-validator"

export class RestoreBackupDto {
  @IsString()
  backupId: string

  @IsOptional()
  @IsString()
  targetDatabase?: string

  @IsOptional()
  @IsDateString()
  pointInTime?: Date

  @IsOptional()
  @IsString()
  initiatedBy?: string
}
