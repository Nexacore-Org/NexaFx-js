import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DisputeEscrowDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
