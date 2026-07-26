import { IsNotEmpty, IsUrl, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class KycSubmissionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  documentFrontUrl: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @IsUrl()
  documentBackUrl: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  documentType: string;
}
