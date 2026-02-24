import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RequirePermissions } from '../decorators/permissions.decorator';
import { PermissionAction, PermissionResource } from '../entities/permission.entity';
import { RoleService } from '../services/role.service';
import { PermissionService } from '../services/permission.service';
import { RbacAuditService } from '../services/rbac-audit.service';
import { PermissionResolutionService } from '../policies/permission-resolution.service';
import { CurrentUser } from '../decorators/current-user.decorator';
import {
  CreateRoleDto,
  UpdateRoleDto,
  AssignPermissionsDto,
  RevokePermissionsDto,
  AssignRolesToUserDto,
  RevokeRolesFromUserDto,
} from '../dto/role.dto';
import { CreatePermissionDto, UpdatePermissionDto } from '../dto/permission.dto';

@ApiTags('Admin — RBAC')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/rbac')
export class RbacAdminController {
  constructor(
    private readonly roleService: RoleService,
    private readonly permissionService: PermissionService,
    private readonly auditService: RbacAuditService,
    private readonly resolutionService: PermissionResolutionService,
  ) {}

  // ── Roles ──────────────────────────────────────────────────────────────────

  @Post('roles')
  @RequirePermissions({ action: PermissionAction.CREATE, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'Create a new role' })
  @ApiResponse({ status: 201, description: 'Role created' })
  createRole(@Body() dto: CreateRoleDto, @CurrentUser('id') actorId: string) {
    return this.roleService.create(dto, actorId);
  }

  @Get('roles')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'List all roles with hierarchy' })
  listRoles() {
    return this.roleService.findAll();
  }

  @Get('roles/:id')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'Get a single role' })
  getRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.findOne(id);
  }

  @Patch('roles/:id')
  @RequirePermissions({ action: PermissionAction.UPDATE, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'Update a role' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.roleService.update(id, dto, actorId);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: PermissionAction.DELETE, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'Delete a role (non-system only)' })
  deleteRole(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.roleService.remove(id, actorId);
  }

  // ── Role ↔ Permission ──────────────────────────────────────────────────────

  @Post('roles/:id/permissions')
  @RequirePermissions({ action: PermissionAction.MANAGE, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'Assign permissions to a role' })
  assignPermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.roleService.assignPermissions(id, dto, actorId);
  }

  @Delete('roles/:id/permissions')
  @RequirePermissions({ action: PermissionAction.MANAGE, resource: PermissionResource.ROLE })
  @ApiOperation({ summary: 'Revoke permissions from a role' })
  revokePermissions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RevokePermissionsDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.roleService.revokePermissions(id, dto.permissionIds, actorId);
  }

  // ── User ↔ Role ────────────────────────────────────────────────────────────

  @Post('users/roles')
  @RequirePermissions({ action: PermissionAction.MANAGE, resource: PermissionResource.USER })
  @ApiOperation({ summary: 'Assign roles to a user' })
  assignRolesToUser(
    @Body() dto: AssignRolesToUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.roleService.assignRolesToUser(dto, actorId);
  }

  @Delete('users/:userId/roles')
  @RequirePermissions({ action: PermissionAction.MANAGE, resource: PermissionResource.USER })
  @ApiOperation({ summary: 'Revoke roles from a user' })
  revokeRolesFromUser(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: RevokeRolesFromUserDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.roleService.revokeRolesFromUser(userId, dto.roleIds, actorId);
  }

  @Get('users/:userId/permissions')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.USER })
  @ApiOperation({ summary: 'Resolve effective permissions for a user' })
  async getUserPermissions(@Param('userId', ParseUUIDPipe) userId: string) {
    const resolved = await this.resolutionService.resolveUserPermissions(userId);
    return {
      userId,
      roles: resolved.roles,
      permissions: [...resolved.permissions],
    };
  }

  // ── Permissions CRUD ───────────────────────────────────────────────────────

  @Post('permissions')
  @RequirePermissions({ action: PermissionAction.CREATE, resource: PermissionResource.PERMISSION })
  @ApiOperation({ summary: 'Create a new permission' })
  createPermission(@Body() dto: CreatePermissionDto, @CurrentUser('id') actorId: string) {
    return this.permissionService.create(dto, actorId);
  }

  @Get('permissions')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.PERMISSION })
  @ApiOperation({ summary: 'List all permissions' })
  listPermissions() {
    return this.permissionService.findAll();
  }

  @Get('permissions/:id')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.PERMISSION })
  @ApiOperation({ summary: 'Get a single permission' })
  getPermission(@Param('id', ParseUUIDPipe) id: string) {
    return this.permissionService.findOne(id);
  }

  @Patch('permissions/:id')
  @RequirePermissions({ action: PermissionAction.UPDATE, resource: PermissionResource.PERMISSION })
  @ApiOperation({ summary: 'Update a permission' })
  updatePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePermissionDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.permissionService.update(id, dto, actorId);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions({ action: PermissionAction.DELETE, resource: PermissionResource.PERMISSION })
  @ApiOperation({ summary: 'Delete a permission' })
  deletePermission(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.permissionService.remove(id, actorId);
  }

  // ── Audit Logs ─────────────────────────────────────────────────────────────

  @Get('audit-logs')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.AUDIT_LOG })
  @ApiOperation({ summary: 'List RBAC audit logs' })
  getAuditLogs(
    @Query('take') take?: number,
    @Query('skip') skip?: number,
  ) {
    return this.auditService.findAll({ take: take ?? 50, skip: skip ?? 0 });
  }

  @Get('audit-logs/users/:userId')
  @RequirePermissions({ action: PermissionAction.READ, resource: PermissionResource.AUDIT_LOG })
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  getUserAuditLogs(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.auditService.findByTargetUser(userId);
  }
}
