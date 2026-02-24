import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class SuspendUserDto {
  @IsBoolean()
  suspended: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}
