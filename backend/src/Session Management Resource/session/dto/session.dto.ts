import { IsString, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  token: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;

  @IsNotEmpty()
  expiresAt: Date;
}

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}