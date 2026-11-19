import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Body of `POST /auth/refresh`. `@Body('refreshToken')` bypasses the global
 * ValidationPipe, so a non-string value used to reach `createHmac(...).update()` and
 * come back as a 500 (issue #1528).
 */
export class RefreshTokenDto {
  @ApiProperty({ description: 'The opaque refresh token returned by login/register/refresh', minLength: 16, maxLength: 512 })
  @IsString()
  @Length(16, 512)
  refreshToken!: string;
}

/** Body of `POST /auth/logout`: the token is optional (otherwise the session in the access token is revoked). */
export class LogoutDto {
  @ApiPropertyOptional({ description: 'Refresh token to revoke; defaults to the current session', minLength: 16, maxLength: 512 })
  @IsOptional()
  @IsString()
  @Length(16, 512)
  refreshToken?: string;
}
