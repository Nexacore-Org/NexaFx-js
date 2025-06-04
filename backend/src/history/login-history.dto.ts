import { IsOptional, IsBoolean, IsDateString, IsNumber } from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginHistoryResponseDto {
  id: number;
  userId: number;
  email: string;
  ipAddress: string;
  userAgent: string;
  isSuccessful: boolean;
  failureReason?: string;
  location?: string;
  createdAt: Date;
}

export class LoginHistoryQueryDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value))
  @IsNumber()
  limit?: number = 10;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  isSuccessful?: boolean;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateLoginHistoryDto {
  userId: number;
  email: string;
  ipAddress: string;
  userAgent: string;
  isSuccessful: boolean;
  failureReason?: string;
  location?: string;
}