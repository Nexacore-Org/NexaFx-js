import { IsString, IsOptional } from 'class-validator';

export class UnfreezeAccountDto {
  @IsString()
  @IsOptional()
  notes?: string;
}
