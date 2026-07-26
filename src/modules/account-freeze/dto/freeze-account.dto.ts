import { IsString, IsUUID, IsOptional, MinLength } from 'class-validator';

export class FreezeAccountDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(1)
  reason: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
