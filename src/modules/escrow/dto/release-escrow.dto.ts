import { IsOptional, IsString } from 'class-validator';

export class ReleaseEscrowDto {
  @IsOptional()
  @IsString()
  note?: string;
}
