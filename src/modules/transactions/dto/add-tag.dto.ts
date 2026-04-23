import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddTagDto {
  @ApiProperty({ 
    description: 'Tag name (will be normalized to lowercase)', 
    example: 'groceries',
    maxLength: 50 
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  tag: string;
}
