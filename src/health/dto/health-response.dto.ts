import { ApiProperty } from '@nestjs/swagger';

class HealthComponentDto {
  @ApiProperty({ example: 'up' })
  status!: string;

  @ApiProperty({ required: false, example: 'Redis unavailable; using in-memory fallbacks' })
  message?: string;
}

class HealthDetailsDto {
  @ApiProperty({ type: HealthComponentDto })
  database!: HealthComponentDto;

  @ApiProperty({ type: HealthComponentDto })
  redis!: HealthComponentDto;

  @ApiProperty({ type: HealthComponentDto })
  memory!: HealthComponentDto;

  @ApiProperty({ type: HealthComponentDto })
  disk!: HealthComponentDto;
}

export class HealthResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ type: HealthDetailsDto })
  details!: HealthDetailsDto;
}
