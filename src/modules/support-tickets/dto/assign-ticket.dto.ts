import { IsUUID, IsOptional, IsIn } from 'class-validator';
import { TicketStatus } from '../entities/support-ticket.entity';

export const TICKET_STATUSES: TicketStatus[] = [
  'open',
  'in_progress',
  'waiting_customer',
  'resolved',
  'closed',
];

export class AssignTicketDto {
  @IsUUID()
  assignedTo: string;

  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;
}
