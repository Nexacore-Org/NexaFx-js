import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddNoteDto {
  @ApiProperty({ 
    description: 'Note content', 
    example: 'Payment for monthly subscription',
    maxLength: 1000 
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  content: string;
}
