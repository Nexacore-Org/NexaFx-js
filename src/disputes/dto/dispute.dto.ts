import { IsString, IsOptional, IsUUID } from 'class-validator';

export class FileDisputeDto {
  @IsUUID()
  transactionId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class DisputeMessageDto {
  @IsString()
  message: string;
}

export class EscalateDisputeDto {
  @IsOptional()
  @IsUUID()
  assignTo?: string;
}
