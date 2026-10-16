import { IsString, Length } from 'class-validator';

export class AppealKycRequestDto {
  @IsString()
  @Length(10, 2000)
  reason!: string;
}
