import { IsString, Length } from 'class-validator';

export class ApplyReferralDto {
  @IsString()
  @Length(2, 64)
  code!: string;
}
