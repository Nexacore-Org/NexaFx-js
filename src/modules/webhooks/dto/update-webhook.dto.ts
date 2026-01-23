import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateWebhookDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  events?: string[];

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: 'active' | 'disabled';
}
