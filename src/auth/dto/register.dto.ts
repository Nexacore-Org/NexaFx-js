import { NormalizeEmail } from '../../common/decorators/normalize-email.decorator';
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { DEFAULT_PASSWORD_POLICY } from '../password-policy.service';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com', maxLength: 254 })
  @NormalizeEmail()
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // Strength rules and the (configurable) minimum are enforced by PasswordPolicyService (see
  // GET /auth/password-policy). The documented bounds are its defaults; the hard upper bound is
  // enforced here so an oversized body is a 400 before any hashing (issue #1528).
  @ApiProperty({
    minLength: DEFAULT_PASSWORD_POLICY.minLength,
    maxLength: DEFAULT_PASSWORD_POLICY.maxLength,
    example: 'correct horse battery staple 42!',
    description: 'Must satisfy the password policy; see GET /auth/password-policy',
  })
  @IsString()
  @MaxLength(DEFAULT_PASSWORD_POLICY.maxLength)
  password!: string;

  @ApiProperty({ example: 'Ada', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Lovelace', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;
}
