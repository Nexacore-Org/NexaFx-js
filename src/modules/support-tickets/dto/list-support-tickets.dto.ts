import { IsOptional, IsEnum, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TicketStatus } from '../entities/support-ticket.entity';

export class ListSupportTicketsDto {
  @IsOptional()
  @IsEnum(['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'])
  status?: TicketStatus;

  @IsOptional()
  @IsString()
  assignedTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
