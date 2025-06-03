import { IsString, IsOptional, IsIP } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  userId: string;

  @IsString()
  userAgent: string;

  @IsIP()
  ipAddress: string;

  @IsOptional()
  @IsString()
  deviceName?: string;

  @IsOptional()
  @IsString()
  deviceType?: string;
}