import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Opaque, rotating refresh token (stored hashed server-side).' })
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'When the refresh token expires.' })
  refreshTokenExpiresAt?: Date;
}
