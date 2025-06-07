import { IsString, IsOptional, IsArray, IsDateString, MinLength, MaxLength } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class CreateApiKeyDto {
  @ApiProperty({
    description: "Name of the API key",
    example: "Production API Key",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string

  @ApiProperty({
    description: "Description of the API key",
    example: "API key for production environment",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiProperty({
    description: "Expiration date of the API key",
    example: "2024-12-31T23:59:59.000Z",
    required: false,
  })
  @IsOptional()
  @IsDateString()
  expiresAt?: string

  @ApiProperty({
    description: "Scopes/permissions for the API key",
    example: ["read", "write"],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[]

  @ApiProperty({
    description: "User ID associated with the API key",
    required: false,
  })
  @IsOptional()
  @IsString()
  userId?: string
}
