import { IsArray, IsUUID } from "class-validator"
import { ApiProperty } from "@nestjs/swagger"

export class AssignRolesDto {
  @ApiProperty({
    description: "Array of role IDs to assign",
    example: ["role-uuid-1", "role-uuid-2"],
  })
  @IsArray()
  @IsUUID(4, { each: true })
  roleIds: string[]
}

export class AssignPermissionsDto {
  @ApiProperty({
    description: "Array of permission IDs to assign",
    example: ["permission-uuid-1", "permission-uuid-2"],
  })
  @IsArray()
  @IsUUID(4, { each: true })
  permissionIds: string[]
}
