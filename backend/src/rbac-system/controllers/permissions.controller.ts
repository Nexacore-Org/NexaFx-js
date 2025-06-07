import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus, Query } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger"
import type { PermissionsService } from "../services/permissions.service"
import type { CreatePermissionDto } from "../dto/create-permission.dto"
import type { UpdatePermissionDto } from "../dto/update-permission.dto"

@ApiTags("Permissions")
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @ApiOperation({ summary: "Create a new permission" })
  @ApiResponse({ status: 201, description: "Permission created successfully" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @ApiResponse({ status: 409, description: "Permission already exists" })
  async create(@Body() createPermissionDto: CreatePermissionDto) {
    return await this.permissionsService.create(createPermissionDto)
  }

  @Get()
  @ApiOperation({ summary: "Get all permissions" })
  @ApiQuery({ name: "resource", required: false, description: "Filter by resource" })
  @ApiResponse({ status: 200, description: "List of permissions" })
  async findAll(@Query("resource") resource?: string) {
    if (resource) {
      return await this.permissionsService.findByResource(resource)
    }
    return await this.permissionsService.findAll()
  }

  @Get("resources")
  @ApiOperation({ summary: "Get all resources and their actions" })
  @ApiResponse({ status: 200, description: "List of resources and actions" })
  async getResourceActions() {
    return await this.permissionsService.getResourceActions()
  }

  @Get(":id")
  @ApiOperation({ summary: "Get permission by ID" })
  @ApiResponse({ status: 200, description: "Permission details" })
  @ApiResponse({ status: 404, description: "Permission not found" })
  async findOne(@Param("id") id: string) {
    return await this.permissionsService.findOne(id)
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update permission" })
  @ApiResponse({ status: 200, description: "Permission updated successfully" })
  @ApiResponse({ status: 404, description: "Permission not found" })
  async update(@Param("id") id: string, @Body() updatePermissionDto: UpdatePermissionDto) {
    return await this.permissionsService.update(id, updatePermissionDto)
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete permission" })
  @ApiResponse({ status: 204, description: "Permission deleted successfully" })
  @ApiResponse({ status: 404, description: "Permission not found" })
  @ApiResponse({ status: 400, description: "Cannot delete system permission or permission with roles" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.permissionsService.remove(id)
  }

  @Get(":id/roles")
  @ApiOperation({ summary: "Get roles with this permission" })
  @ApiResponse({ status: 200, description: "Roles with permission" })
  @ApiResponse({ status: 404, description: "Permission not found" })
  async getRolesWithPermission(@Param("id") id: string) {
    const permission = await this.permissionsService.getRolesWithPermission(id)
    return {
      permission: {
        id: permission.id,
        name: permission.name,
        displayName: permission.displayName
      },
      roles: permission.roles || []
    }
  }
}
