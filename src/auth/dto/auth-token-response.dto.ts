import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthTokenResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiPropertyOptional({ description: 'Opaque, rotating refresh token (stored hashed server-side).' })
  refreshToken?: string;

  @ApiPropertyOptional({ description: 'When the refresh token expires.' })
  refreshTokenExpiresAt?: Date;

  @ApiProperty({
    enum: ['accept_terms'],
    nullable: true,
    description: 'Set when the user must accept the current terms; money-moving flows enforce it.',
  })
  requiresAction!: 'accept_terms' | null;
}
