// ===== 2. ip-whitelist.dto.ts =====
import { IsString, IsOptional, IsBoolean, IsIP, Length } from 'class-validator';
  
export class CreateIpWhitelistDto {
  @IsIP(4, { message: 'Must be a valid IPv4 address' })
  ipAddress: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;

  @IsOptional()
  @IsString()
  createdBy?: string;
}

export class UpdateIpWhitelistDto {
  @IsOptional()
  @IsString()
  @Length(1, 255)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class IpWhitelistResponseDto {
  id: string;
  ipAddress: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}
