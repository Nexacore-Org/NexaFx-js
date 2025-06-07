import { Injectable } from "@nestjs/common"
import type { UsersService } from "./users.service"
import type { RolesService } from "./roles.service"
import type { PermissionsService } from "./permissions.service"

@Injectable()
export class RbacService {
  constructor(
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async checkUserPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(userId)
      return user.hasPermission(permission)
    } catch {
      return false
    }
  }

  async checkUserRole(userId: string, roleName: string): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(userId)
      return user.hasRole(roleName)
    } catch {
      return false
    }
  }

  async checkUserPermissions(userId: string, permissions: string[]): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(userId)
      const userPermissions = user.getAllPermissions()
      return permissions.every((permission) => userPermissions.includes(permission))
    } catch {
      return false
    }
  }

  async checkUserRoles(userId: string, roleNames: string[]): Promise<boolean> {
    try {
      const user = await this.usersService.findOne(userId)
      return roleNames.every((roleName) => user.hasRole(roleName))
    } catch {
      return false
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const user = await this.usersService.findOne(userId)
      return user.getAllPermissions()
    } catch {
      return []
    }
  }

  async getUserRoles(userId: string): Promise<string[]> {
    try {
      const user = await this.usersService.findOne(userId)
      return user.roles?.map((role) => role.name) || []
    } catch {
      return []
    }
  }

  async canAccessResource(userId: string, resource: string, action: string): Promise<boolean> {
    const permissionName = `${resource}:${action}`
    return this.checkUserPermission(userId, permissionName)
  }

  async getUserAccessMatrix(userId: string): Promise<{
    roles: string[]
    permissions: string[]
    resources: { [resource: string]: string[] }
  }> {
    try {
      const user = await this.usersService.findOne(userId)
      const permissions = user.getAllPermissions()
      const roles = user.roles?.map((role) => role.name) || []

      // Group permissions by resource
      const resources: { [resource: string]: string[] } = {}
      permissions.forEach((permission) => {
        const [resource, action] = permission.split(":")
        if (resource && action) {
          if (!resources[resource]) {
            resources[resource] = []
          }
          resources[resource].push(action)
        }
      })

      return { roles, permissions, resources }
    } catch {
      return { roles: [], permissions: [], resources: {} }
    }
  }

  async initializeSystemRolesAndPermissions(): Promise<void> {
    // Create system permissions
    const systemPermissions = [
      { name: "users:create", displayName: "Create Users", resource: "users", action: "create", isSystem: true },
      { name: "users:read", displayName: "Read Users", resource: "users", action: "read", isSystem: true },
      { name: "users:update", displayName: "Update Users", resource: "users", action: "update", isSystem: true },
      { name: "users:delete", displayName: "Delete Users", resource: "users", action: "delete", isSystem: true },
      { name: "roles:create", displayName: "Create Roles", resource: "roles", action: "create", isSystem: true },
      { name: "roles:read", displayName: "Read Roles", resource: "roles", action: "read", isSystem: true },
      { name: "roles:update", displayName: "Update Roles", resource: "roles", action: "update", isSystem: true },
      { name: "roles:delete", displayName: "Delete Roles", resource: "roles", action: "delete", isSystem: true },
      {
        name: "permissions:create",
        displayName: "Create Permissions",
        resource: "permissions",
        action: "create",
        isSystem: true,
      },
      {
        name: "permissions:read",
        displayName: "Read Permissions",
        resource: "permissions",
        action: "read",
        isSystem: true,
      },
      {
        name: "permissions:update",
        displayName: "Update Permissions",
        resource: "permissions",
        action: "update",
        isSystem: true,
      },
      {
        name: "permissions:delete",
        displayName: "Delete Permissions",
        resource: "permissions",
        action: "delete",
        isSystem: true,
      },
    ]

    await this.permissionsService.createBulk(systemPermissions)

    // Create system roles
    const adminRole = await this.rolesService.findByName("admin")
    if (!adminRole) {
      const allPermissions = await this.permissionsService.findAll()
      await this.rolesService.create({
        name: "admin",
        displayName: "Administrator",
        description: "Full system access",
        isSystem: true,
        permissionIds: allPermissions.map((p) => p.id),
      })
    }

    const userRole = await this.rolesService.findByName("user")
    if (!userRole) {
      const readPermissions = await this.permissionsService.findAll()
      const userPermissions = readPermissions.filter((p) => p.action === "read")

      await this.rolesService.create({
        name: "user",
        displayName: "User",
        description: "Basic user access",
        isSystem: true,
        permissionIds: userPermissions.map((p) => p.id),
      })
    }
  }
}
