import { IsIn, IsOptional } from 'class-validator';

export class RetryJobControlDto {
  @IsIn(['pending', 'cancelled'])
  status: 'pending' | 'cancelled';
}
