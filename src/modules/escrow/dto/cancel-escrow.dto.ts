import { IsOptional, IsString } from 'class-validator';

export class CancelEscrowDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
