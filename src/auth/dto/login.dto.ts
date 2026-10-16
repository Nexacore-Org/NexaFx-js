import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @NormalizeEmail()
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: 'correcthorsebatterystaple' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ description: 'TOTP 2FA code (required for admin accounts with 2FA enforcement)' })
  @IsOptional()
  @IsString()
  totpCode?: string;
}
