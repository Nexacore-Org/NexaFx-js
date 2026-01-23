import { IsBoolean, IsOptional } from 'class-validator';

export class ReplayTransactionDto {
  @IsOptional()
  @IsBoolean()
  includeLogs?: boolean;
}
