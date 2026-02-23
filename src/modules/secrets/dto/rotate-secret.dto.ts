import { IsEnum, IsString, MinLength } from 'class-validator';
import { SecretType } from '../entities/secret.entity';

export class RotateSecretDto {
  @IsEnum(['JWT', 'WALLET_ENCRYPTION', 'WEBHOOK'])
  type: SecretType;

  @IsString()
  @MinLength(32)
  newValue: string;
}
