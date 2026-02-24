import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Role } from './entities/role.entity';
import { Permission } from './entities/permission.entity';
import { User } from './entities/user.entity';
import { RbacAuditLog } from './entities/rbac-audit-log.entity';
import { RoleService } from './services/role.service';
import { PermissionService } from './services/permission.service';
import { RbacAuditService } from './services/rbac-audit.service';
import { PermissionResolutionService } from './policies/permission-resolution.service';
import { PolicyEvaluatorService } from './policies/policy-evaluator.service';
import { PermissionsGuard } from './guards/permissions.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RbacAdminController } from './admin/rbac-admin.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Role, Permission, User, RbacAuditLog])],
  controllers: [RbacAdminController],
  providers: [
    RoleService,
    PermissionService,
    RbacAuditService,
    PermissionResolutionService,
    PolicyEvaluatorService,
    PermissionsGuard,
    JwtAuthGuard,
  ],
  exports: [
    RoleService,
    PermissionService,
    RbacAuditService,
    PermissionResolutionService,
    PolicyEvaluatorService,
    PermissionsGuard,
    JwtAuthGuard,
    TypeOrmModule,
  ],
})
export class RbacModule {}
