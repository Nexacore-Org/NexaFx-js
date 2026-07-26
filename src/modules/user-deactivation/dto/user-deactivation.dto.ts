import { IsString, IsOptional } from 'class-validator';

export class DeactivateUserDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
