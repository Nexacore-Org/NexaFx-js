import { IsNumber, IsOptional, Min } from "class-validator"

export class ConfigureRetentionDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  dailyBackups?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  weeklyBackups?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  monthlyBackups?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  yearlyBackups?: number

  @IsOptional()
  @IsNumber()
  @Min(1)
  transactionLogs?: number
}
