import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export const MAX_TICKET_MESSAGE_LENGTH = 5000;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateTicketMessageDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_TICKET_MESSAGE_LENGTH)
  message: string;
}
