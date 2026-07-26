import { IsString, IsUUID, IsOptional, MinLength, Matches } from 'class-validator';

export class CreateFederationAddressDto {
  @IsString()
  @MinLength(1)
  @Matches(/^[a-zA-Z0-9._-]+$/, {
    message: 'Name must contain only alphanumeric characters, dots, hyphens, and underscores',
  })
  name: string;

  @IsString()
  @MinLength(1)
  domain: string;

  @IsString()
  @MinLength(1)
  stellarAddress: string;

  @IsString()
  @IsOptional()
  memo?: string;

  @IsString()
  @IsOptional()
  memoType?: string;
}
