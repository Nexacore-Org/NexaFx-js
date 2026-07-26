import { IsString, MinLength } from 'class-validator';

export class CreateTicketMessageDto {
  @IsString()
  @MinLength(1)
  message: string;
}
