import { IsEmail, IsString, MinLength, IsOptional, IsBoolean, Length } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  @Length(6, 6)
  twoFactorCode?: string;
}

export class Enable2FADto {
  @IsString()
  @Length(6, 6)
  code: string;
}

export class Disable2FADto {
  @IsString()
  @Length(6, 6)
  code: string;
}
