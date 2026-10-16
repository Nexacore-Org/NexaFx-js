import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  // Length and strength are enforced by PasswordPolicyService (see GET /auth/password-policy);
  // a second, different @MinLength here used to contradict it.
  @ApiProperty({
    minLength: 12,
    maxLength: 128,
    example: 'correct horse battery staple 42!',
    description: 'Must satisfy the password policy; see GET /auth/password-policy',
  })
  @IsString()
  password!: string;

  @ApiProperty({ example: 'Ada' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Lovelace' })
  @IsString()
  lastName!: string;
}
