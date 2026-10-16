import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The single-use token from the emailed link' })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;

  @ApiProperty({ minLength: 8, description: 'Validated against the password policy' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
