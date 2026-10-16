import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ minLength: 12, description: 'Must satisfy the password policy; see GET /auth/password-policy' })
  @IsString()
  newPassword!: string;
}
