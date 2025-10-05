import { IsString } from "class-validator"

export class ExportBackupDto {
  @IsString()
  backupId: string

  @IsString()
  destination: string
}
