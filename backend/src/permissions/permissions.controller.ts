import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
    ParseUUIDPipe,
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
  import { PermissionsService } from './permissions.service';
  import { CreatePermissionDto, UpdatePermissionDto, LinkRoleDto } from './permissions.dto';
  import { JwtAuthGuard } from '../auth/jwt-auth.guard';
  import { PermissionsGuard } from '../auth/permissions.guard';
  import { RequirePermissions } from '../auth/permissions.decorator';
  
  @ApiTags('permissions')
  @ApiBearerAuth()
  @Controller('permissions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  export class PermissionsController {
    constructor(private readonly permissionsService: PermissionsService) {}
  
    @Get()
    @RequirePermissions('permissions:read')
    @ApiOperation({ summary: 'Get all permissions' })
    @ApiResponse({ status: 200, description: 'Return all permissions' })
    async findAll(
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('resource') resource?: string,
      @Query('action') action?: string,
    ) {
      return this.permissionsService.findAll({
        page: page || 1,
        limit: limit || 10,
        resource,
        action,
      });
    }
  
    @Get(':id')
    @RequirePermissions('permissions:read')
    @ApiOperation({ summary: 'Get permission by ID' })
    @ApiResponse({ status: 200, description: 'Return permission' })
    @ApiResponse({ status: 404, description: 'Permission not found' })
    async findOne(@Param('id', ParseUUIDPipe) id: string) {
      return this.permissionsService.findOne(id);
    }
  
    @Post()
    @RequirePermissions('permissions:create')
    @ApiOperation({ summary: 'Create new permission' })
    @ApiResponse({ status: 201, description: 'Permission created successfully' })
    @ApiResponse({ status: 400, description: 'Bad request' })
    async create(@Body() createPermissionDto: CreatePermissionDto) {
      return this.permissionsService.create(createPermissionDto);
    }
  
    @Put(':id')
    @RequirePermissions('permissions:update')
    @ApiOperation({ summary: 'Update permission' })
    @ApiResponse({ status: 200, description: 'Permission updated successfully' })
    @ApiResponse({ status: 404, description: 'Permission not found' })
    async update(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() updatePermissionDto: UpdatePermissionDto,
    ) {
      return this.permissionsService.update(id, updatePermissionDto);
    }
  
    @Delete(':id')
    @RequirePermissions('permissions:delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete permission' })
    @ApiResponse({ status: 204, description: 'Permission deleted successfully' })
    @ApiResponse({ status: 404, description: 'Permission not found' })
    async remove(@Param('id', ParseUUIDPipe) id: string) {
      return this.permissionsService.remove(id);
    }
  
    @Post(':id/roles')
    @RequirePermissions('permissions:update')
    @ApiOperation({ summary: 'Link permission to roles' })
    @ApiResponse({ status: 200, description: 'Roles linked successfully' })
    async linkRoles(
      @Param('id', ParseUUIDPipe) id: string,
      @Body() linkRoleDto: LinkRoleDto,
    ) {
      return this.permissionsService.linkRoles(id, linkRoleDto.roleIds);
    }
  
    @Delete(':id/roles/:roleId')
    @RequirePermissions('permissions:update')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Unlink permission from role' })
    @ApiResponse({ status: 204, description: 'Role unlinked successfully' })
    async unlinkRole(
      @Param('id', ParseUUIDPipe) id: string,
      @Param('roleId', ParseUUIDPipe) roleId: string,
    ) {
      return this.permissionsService.unlinkRole(id, roleId);
    }
  }
  