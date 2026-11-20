import { IsUUID, IsOptional, IsEnum } from 'class-validator';
import { TicketStatus } from '../entities/support-ticket.entity';

export class AssignTicketDto {
  @IsUUID()
  assignedTo: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}
