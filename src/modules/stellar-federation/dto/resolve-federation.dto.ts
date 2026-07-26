import { IsString, MinLength } from 'class-validator';

export class ResolveFederationDto {
  @IsString()
  @MinLength(1)
  q: string;
}
