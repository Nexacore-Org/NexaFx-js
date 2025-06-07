import { IsString, IsEmail, IsOptional, IsArray, MinLength, MaxLength, IsUUID } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class CreateUserDto {
  @ApiProperty({
    description: "User's email address",
    example: "john.doe@example.com",
  })
  @IsEmail()
  email: string

  @ApiProperty({
    description: "User's first name",
    example: "John",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName: string

  @ApiProperty({
    description: "User's last name",
    example: "Doe",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName: string

  @ApiProperty({
    description: "User's password",
    example: "SecurePassword123!",
  })
  @IsString()
  @MinLength(8)
  password: string

  @ApiProperty({
    description: "User's department",
    example: "Engineering",
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string

  @ApiProperty({
    description: "Role IDs to assign to the user",
    example: ["role-uuid-1", "role-uuid-2"],
    required: false,
  })
  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  roleIds?: string[]

  @ApiProperty({
    description: "Additional metadata",
    required: false,
  })
  @IsOptional()
  metadata?: Record<string, any>
}
