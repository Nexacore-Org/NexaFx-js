import { IsOptional, IsEnum, IsString, Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';

export class ListKycTierUpgradesDto {
  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected'])
  status?: 'pending' | 'approved' | 'rejected';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
