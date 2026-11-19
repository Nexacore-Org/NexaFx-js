import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { DEFAULT_PASSWORD_POLICY } from '../password-policy.service';

export class ResetPasswordDto {
  @ApiProperty({ description: 'The single-use token from the emailed link', minLength: 16, maxLength: 256 })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  token!: string;

  // The old `@MinLength(8)` contradicted the real policy (12-128 characters): it documented 8 and
  // let a 9-character password through to a less helpful policy error. Strength and the exact
  // minimum come from PasswordPolicyService; this only bounds the body (issue #1528).
  @ApiProperty({
    minLength: DEFAULT_PASSWORD_POLICY.minLength,
    maxLength: DEFAULT_PASSWORD_POLICY.maxLength,
    description: 'Validated against the password policy; see GET /auth/password-policy',
  })
  @IsString()
  @MaxLength(DEFAULT_PASSWORD_POLICY.maxLength)
  newPassword!: string;
}
