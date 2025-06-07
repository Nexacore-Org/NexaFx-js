import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { User } from "./entities/user.entity"
import { Role } from "./entities/role.entity"
import { Permission } from "./entities/permission.entity"
import { UsersService } from "./services/users.service"
import { RolesService } from "./services/roles.service"
import { PermissionsService } from "./services/permissions.service"
import { RbacService } from "./services/rbac.service"
import { UsersController } from "./controllers/users.controller"
import { RolesController } from "./controllers/roles.controller"
import { PermissionsController } from "./controllers/permissions.controller"
import { RolesGuard } from "./guards/roles.guard"
import { PermissionsGuard } from "./guards/permissions.guard"

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Permission])],
  controllers: [UsersController, RolesController, PermissionsController],
  providers: [UsersService, RolesService, PermissionsService, RbacService, RolesGuard, PermissionsGuard],
  exports: [UsersService, RolesService, PermissionsService, RbacService, RolesGuard, PermissionsGuard],
})
export class RbacModule {}
