import { IsString, IsNumber, IsBoolean, IsOptional, IsIn } from 'class-validator';

export class CreateEndpointRateLimitDto {
  @IsString()
  endpoint: string;

  @IsString()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method: string;

  @IsNumber()
  maxRequests: number;

  @IsNumber()
  windowMs: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateEndpointRateLimitDto {
  @IsString()
  @IsOptional()
  endpoint?: string;

  @IsString()
  @IsOptional()
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
  method?: string;

  @IsNumber()
  @IsOptional()
  maxRequests?: number;

  @IsNumber()
  @IsOptional()
  windowMs?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
