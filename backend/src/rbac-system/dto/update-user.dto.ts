import { PartialType, OmitType } from "@nestjs/swagger"
import { CreateUserDto } from "./create-user.dto"
import { IsOptional, IsBoolean } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ["password"] as const)) {
  @ApiProperty({
    description: "Whether the user is active",
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
