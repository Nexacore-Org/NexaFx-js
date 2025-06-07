import { PartialType } from "@nestjs/swagger"
import { CreateRoleDto } from "./create-role.dto"
import { IsOptional, IsBoolean } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class UpdateRoleDto extends PartialType(CreateRoleDto) {
  @ApiProperty({
    description: "Whether the role is active",
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
