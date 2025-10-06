import { IsString } from "class-validator"

export class VerifyBackupDto {
  @IsString()
  backupId: string
}
