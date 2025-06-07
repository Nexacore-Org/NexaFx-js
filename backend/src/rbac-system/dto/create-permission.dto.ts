import { IsString, IsOptional, IsBoolean, MinLength, MaxLength } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class CreatePermissionDto {
  @ApiProperty({
    description: "Permission name (unique identifier)",
    example: "users:create",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string

  @ApiProperty({
    description: "Human-readable permission name",
    example: "Create Users",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName: string

  @ApiProperty({
    description: "Permission description",
    example: "Allows creating new users",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiProperty({
    description: "Resource this permission applies to",
    example: "users",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  resource?: string

  @ApiProperty({
    description: "Action this permission allows",
    example: "create",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  action?: string

  @ApiProperty({
    description: "Whether this is a system permission",
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean

  @ApiProperty({
    description: "Additional metadata",
    required: false,
  })
  @IsOptional()
  metadata?: Record<string, any>
}
