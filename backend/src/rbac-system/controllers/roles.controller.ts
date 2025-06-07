import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger"
import type { RolesService } from "../services/roles.service"
import type { CreateRoleDto } from "../dto/create-role.dto"
import type { UpdateRoleDto } from "../dto/update-role.dto"
import type { AssignPermissionsDto } from "../dto/assign-roles.dto"

@ApiTags("Roles")
@Controller("roles")
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @ApiOperation({ summary: "Create a new role" })
  @ApiResponse({ status: 201, description: "Role created successfully" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @ApiResponse({ status: 409, description: "Role already exists" })
  async create(@Body() createRoleDto: CreateRoleDto) {
    return this.rolesService.create(createRoleDto);
  }

  @Get()
  @ApiOperation({ summary: "Get all roles" })
  @ApiResponse({ status: 200, description: "List of roles" })
  async findAll() {
    return this.rolesService.findAll()
  }

  @Get(":id")
  @ApiOperation({ summary: "Get role by ID" })
  @ApiResponse({ status: 200, description: "Role details" })
  @ApiResponse({ status: 404, description: "Role not found" })
  async findOne(@Param("id") id: string) {
    return this.rolesService.findOne(id)
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update role" })
  @ApiResponse({ status: 200, description: "Role updated successfully" })
  @ApiResponse({ status: 404, description: "Role not found" })
  async update(@Param("id") id: string, @Body() updateRoleDto: UpdateRoleDto) {
    return this.rolesService.update(id, updateRoleDto)
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete role" })
  @ApiResponse({ status: 204, description: "Role deleted successfully" })
  @ApiResponse({ status: 404, description: "Role not found" })
  @ApiResponse({ status: 400, description: "Cannot delete system role or role with users" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.rolesService.remove(id)
  }

  @Post(":id/permissions")
  @ApiOperation({ summary: "Assign permissions to role" })
  @ApiResponse({ status: 200, description: "Permissions assigned successfully" })
  @ApiResponse({ status: 404, description: "Role or permissions not found" })
  async assignPermissions(@Param("id") id: string, @Body() assignPermissionsDto: AssignPermissionsDto) {
    return this.rolesService.assignPermissions(id, assignPermissionsDto.permissionIds)
  }

  @Post(":id/permissions/add")
  @ApiOperation({ summary: "Add permissions to role" })
  @ApiResponse({ status: 200, description: "Permissions added successfully" })
  @ApiResponse({ status: 404, description: "Role or permissions not found" })
  async addPermissions(@Param("id") id: string, @Body() assignPermissionsDto: AssignPermissionsDto) {
    return this.rolesService.addPermissions(id, assignPermissionsDto.permissionIds)
  }

  @Post(":id/permissions/remove")
  @ApiOperation({ summary: "Remove permissions from role" })
  @ApiResponse({ status: 200, description: "Permissions removed successfully" })
  @ApiResponse({ status: 404, description: "Role not found" })
  async removePermissions(@Param("id") id: string, @Body() assignPermissionsDto: AssignPermissionsDto) {
    return this.rolesService.removePermissions(id, assignPermissionsDto.permissionIds)
  }

  @Get(":id/users")
  @ApiOperation({ summary: "Get users with this role" })
  @ApiResponse({ status: 200, description: "Users with role" })
  @ApiResponse({ status: 404, description: "Role not found" })
  async getUsersWithRole(@Param("id") id: string) {
    const role = await this.rolesService.getUsersWithRole(id)
    return {
      role: {
        id: role.id,
        name: role.name,
        displayName: role.displayName
      },
      users: role.users?.map(({ passwordHash, ...user }) => user) || []
    }
  }
}
