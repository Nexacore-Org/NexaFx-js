import { IsString, IsOptional, IsArray, IsBoolean, MinLength, MaxLength, IsUUID } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class CreateRoleDto {
  @ApiProperty({
    description: "Role name (unique identifier)",
    example: "admin",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string

  @ApiProperty({
    description: "Human-readable role name",
    example: "Administrator",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  displayName: string

  @ApiProperty({
    description: "Role description",
    example: "Full system access",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string

  @ApiProperty({
    description: "Whether this is a system role",
    example: false,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isSystem?: boolean

  @ApiProperty({
    description: "Permission IDs to assign to the role",
    example: ["permission-uuid-1", "permission-uuid-2"],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  permissionIds?: string[]

  @ApiProperty({
    description: "Additional metadata",
    required: false,
  })
  @IsOptional()
  metadata?: Record<string, any>
}
