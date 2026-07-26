import { IsUUID, IsOptional } from 'class-validator';

export class AssignTicketDto {
  @IsUUID()
  assignedTo: string;

  @IsOptional()
  status?: string;
}
