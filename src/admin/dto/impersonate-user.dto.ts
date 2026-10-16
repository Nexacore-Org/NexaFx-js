import { IsString, Length } from 'class-validator';

export class ImpersonateUserDto {
  @IsString()
  @Length(10, 500)
  reason!: string;
}
