import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { TicketPriority } from '../entities/support-ticket.entity';

export class CreateSupportTicketDto {
  @IsString()
  @MaxLength(255)
  subject: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsEnum(['low', 'medium', 'high', 'urgent'])
  priority?: TicketPriority;
}
