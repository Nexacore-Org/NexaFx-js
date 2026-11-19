import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AmlDisposition } from '../aml-screening.entity';

export class ReviewScreeningDto {
  @IsEnum(AmlDisposition)
  disposition!: AmlDisposition;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
