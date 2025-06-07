import { ApiProperty } from "@nestjs/swagger"

export class ApiKeyResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  key: string

  @ApiProperty()
  name: string

  @ApiProperty({ required: false })
  description?: string

  @ApiProperty()
  isActive: boolean

  @ApiProperty({ required: false })
  expiresAt?: Date

  @ApiProperty({ required: false })
  lastUsedAt?: Date

  @ApiProperty()
  usageCount: number

  @ApiProperty({ required: false })
  scopes?: string[]

  @ApiProperty({ required: false })
  userId?: string

  @ApiProperty()
  createdAt: Date

  @ApiProperty()
  updatedAt: Date
}

export class CreateApiKeyResponseDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  key: string

  @ApiProperty()
  name: string

  @ApiProperty({ required: false })
  description?: string

  @ApiProperty()
  isActive: boolean

  @ApiProperty({ required: false })
  expiresAt?: Date

  @ApiProperty({ required: false })
  scopes?: string[]

  @ApiProperty({ required: false })
  userId?: string

  @ApiProperty()
  createdAt: Date
}
