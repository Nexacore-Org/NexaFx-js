import { IsOptional, IsString } from 'class-validator';

export class RollbackTransactionDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
