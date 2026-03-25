import { IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SecretType } from '../entities/secret-version.entity';

export class RotateSecretDto {
  @IsEnum(['JWT', 'WALLET_ENCRYPTION', 'WEBHOOK'])
  type: SecretType;

  @IsOptional()
  @IsString()
  @MinLength(32)
  newValue?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  gracePeriodMinutes?: number;
}
