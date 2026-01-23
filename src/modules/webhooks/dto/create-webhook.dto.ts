import { IsArray, IsString, IsUrl, ArrayMinSize } from 'class-validator';

export class CreateWebhookDto {
  @IsUrl()
  url: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  events: string[];
}
