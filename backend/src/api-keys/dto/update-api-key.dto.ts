import { PartialType } from "@nestjs/swagger"
import { CreateApiKeyDto } from "./create-api-key.dto"
import { IsOptional, IsBoolean } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class UpdateApiKeyDto extends PartialType(CreateApiKeyDto) {
  @ApiProperty({
    description: "Whether the API key is active",
    example: true,
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
