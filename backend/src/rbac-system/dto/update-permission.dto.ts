import { PartialType } from "@nestjs/swagger"
import { CreatePermissionDto } from "./create-permission.dto"
import { IsOptional, IsBoolean } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {
  @ApiProperty({
    description: "Whether the permission is active",
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
