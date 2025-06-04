import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestRecoveryDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;
}
