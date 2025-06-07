import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common"
import type { Repository } from "typeorm"
import { Permission } from "../entities/permission.entity"
import type { CreatePermissionDto } from "../dto/create-permission.dto"
import type { UpdatePermissionDto } from "../dto/update-permission.dto"

@Injectable()
export class PermissionsService {
  constructor(private readonly permissionRepository: Repository<Permission>) {}

  async create(createPermissionDto: CreatePermissionDto): Promise<Permission> {
    // Check if permission already exists
    const existingPermission = await this.permissionRepository.findOne({
      where: { name: createPermissionDto.name },
    })

    if (existingPermission) {
      throw new ConflictException("Permission with this name already exists")
    }

    const permission = new Permission()
    permission.name = createPermissionDto.name
    permission.displayName = createPermissionDto.displayName
    permission.description = createPermissionDto.description
    permission.resource = createPermissionDto.resource
    permission.action = createPermissionDto.action
    permission.isSystem = createPermissionDto.isSystem || false
    permission.metadata = createPermissionDto.metadata

    return this.permissionRepository.save(permission)
  }

  async findAll(): Promise<Permission[]> {
    return this.permissionRepository.find({
      order: { resource: "ASC", action: "ASC", name: "ASC" },
    })
  }

  async findByResource(resource: string): Promise<Permission[]> {
    return this.permissionRepository.find({
      where: { resource },
      order: { action: "ASC", name: "ASC" },
    })
  }

  async findOne(id: string): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({
      where: { id },
      relations: ["roles"],
    })

    if (!permission) {
      throw new NotFoundException("Permission not found")
    }

    return permission
  }

  async findByName(name: string): Promise<Permission | null> {
    return this.permissionRepository.findOne({
      where: { name },
    })
  }

  async update(id: string, updatePermissionDto: UpdatePermissionDto): Promise<Permission> {
    const permission = await this.findOne(id)

    if (permission.isSystem && updatePermissionDto.name && updatePermissionDto.name !== permission.name) {
      throw new BadRequestException("Cannot modify system permission name")
    }

    Object.assign(permission, updatePermissionDto)
    return this.permissionRepository.save(permission)
  }

  async remove(id: string): Promise<void> {
    const permission = await this.findOne(id)

    if (permission.isSystem) {
      throw new BadRequestException("Cannot delete system permission")
    }

    if (permission.roles && permission.roles.length > 0) {
      throw new BadRequestException("Cannot delete permission that is assigned to roles")
    }

    await this.permissionRepository.remove(permission)
  }

  async getRolesWithPermission(permissionId: string): Promise<Permission> {
    const permission = await this.permissionRepository.findOne({
      where: { id: permissionId },
      relations: ["roles"],
    })

    if (!permission) {
      throw new NotFoundException("Permission not found")
    }

    return permission
  }

  async createBulk(permissions: CreatePermissionDto[]): Promise<Permission[]> {
    const createdPermissions: Permission[] = []

    for (const permissionDto of permissions) {
      try {
        const permission = await this.create(permissionDto)
        createdPermissions.push(permission)
      } catch (error) {
        // Skip if already exists, but throw other errors
        if (!(error instanceof ConflictException)) {
          throw error
        }
      }
    }

    return createdPermissions
  }

  async getResourceActions(): Promise<{ resource: string; actions: string[] }[]> {
    const permissions = await this.permissionRepository
      .createQueryBuilder("permission")
      .select(["permission.resource", "permission.action"])
      .where("permission.resource IS NOT NULL AND permission.action IS NOT NULL")
      .getMany()

    const resourceMap = new Map<string, Set<string>>()

    permissions.forEach((permission) => {
      if (permission.resource && permission.action) {
        if (!resourceMap.has(permission.resource)) {
          resourceMap.set(permission.resource, new Set())
        }
        resourceMap.get(permission.resource)!.add(permission.action)
      }
    })

    return Array.from(resourceMap.entries()).map(([resource, actions]) => ({
      resource,
      actions: Array.from(actions),
    }))
  }
}
