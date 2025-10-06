import { IsString } from "class-validator"

export class TestRestoreDto {
  @IsString()
  backupId: string
}
