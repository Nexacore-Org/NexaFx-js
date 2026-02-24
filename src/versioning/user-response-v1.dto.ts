import { ApiProperty } from '@nestjs/swagger';

export class UserResponseV1Dto {
  @ApiProperty({ example: '1' })
  id: string;

  @ApiProperty({ example: 'Alice Smith', description: 'Full name (deprecated: use firstName + lastName in v2)' })
  name: string;

  @ApiProperty({ example: 'alice@example.com' })
  email: string;
}
