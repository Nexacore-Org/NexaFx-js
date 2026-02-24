import { ApiProperty } from '@nestjs/swagger';

export class UserResponseV2Dto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'Alice' })
  firstName: string;

  @ApiProperty({ example: 'Smith' })
  lastName: string;

  @ApiProperty({ example: 'alice@example.com' })
  email: string;

  @ApiProperty({ example: '2025-01-01T00:00:00.000Z' })
  createdAt: string;
}
