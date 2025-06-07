import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common"
import type { Repository } from "typeorm"
import { Role } from "../entities/role.entity"
import type { Permission } from "../entities/permission.entity"
import type { CreateRoleDto } from "../dto/create-role.dto"
import type { UpdateRoleDto } from "../dto/update-role.dto"

@Injectable()
export class RolesService {
  constructor(
    private readonly roleRepository: Repository<Role>,
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    // Check if role already exists
    const existingRole = await this.roleRepository.findOne({
      where: { name: createRoleDto.name },
    })

    if (existingRole) {
      throw new ConflictException("Role with this name already exists")
    }

    const role = new Role()
    role.name = createRoleDto.name
    role.displayName = createRoleDto.displayName
    role.description = createRoleDto.description
    role.isSystem = createRoleDto.isSystem || false
    role.metadata = createRoleDto.metadata

    // Assign permissions if provided
    if (createRoleDto.permissionIds && createRoleDto.permissionIds.length > 0) {
      const permissions = await this.permissionRepository.findByIds(createRoleDto.permissionIds)
      role.permissions = permissions
    }

    return this.roleRepository.save(role)
  }

  async findAll(): Promise<Role[]> {
    return this.roleRepository.find({
      relations: ["permissions"],
      order: { createdAt: "DESC" },
    })
  }

  async findOne(id: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: ["permissions", "users"],
    })

    if (!role) {
      throw new NotFoundException("Role not found")
    }

    return role
  }

  async findByName(name: string): Promise<Role | null> {
    return this.roleRepository.findOne({
      where: { name },
      relations: ["permissions"],
    })
  }

  async update(id: string, updateRoleDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOne(id)

    if (role.isSystem && updateRoleDto.name && updateRoleDto.name !== role.name) {
      throw new BadRequestException("Cannot modify system role name")
    }

    Object.assign(role, updateRoleDto)

    // Update permissions if provided
    if (updateRoleDto.permissionIds) {
      const permissions = await this.permissionRepository.findByIds(updateRoleDto.permissionIds)
      role.permissions = permissions
    }

    return this.roleRepository.save(role)
  }

  async remove(id: string): Promise<void> {
    const role = await this.findOne(id)

    if (role.isSystem) {
      throw new BadRequestException("Cannot delete system role")
    }

    if (role.users && role.users.length > 0) {
      throw new BadRequestException("Cannot delete role that is assigned to users")
    }

    await this.roleRepository.remove(role)
  }

  async assignPermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    const role = await this.findOne(roleId)
    const permissions = await this.permissionRepository.findByIds(permissionIds)

    if (permissions.length !== permissionIds.length) {
      throw new NotFoundException("One or more permissions not found")
    }

    role.permissions = permissions
    return this.roleRepository.save(role)
  }

  async addPermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    const role = await this.findOne(roleId)
    const newPermissions = await this.permissionRepository.findByIds(permissionIds)

    if (newPermissions.length !== permissionIds.length) {
      throw new NotFoundException("One or more permissions not found")
    }

    // Add new permissions to existing ones
    const existingPermissionIds = role.permissions.map((permission) => permission.id)
    const permissionsToAdd = newPermissions.filter((permission) => !existingPermissionIds.includes(permission.id))

    role.permissions = [...role.permissions, ...permissionsToAdd]
    return this.roleRepository.save(role)
  }

  async removePermissions(roleId: string, permissionIds: string[]): Promise<Role> {
    const role = await this.findOne(roleId)
    role.permissions = role.permissions.filter((permission) => !permissionIds.includes(permission.id))
    return this.roleRepository.save(role)
  }

  async getUsersWithRole(roleId: string): Promise<Role> {
    const role = await this.roleRepository.findOne({
      where: { id: roleId },
      relations: ["users"],
    })

    if (!role) {
      throw new NotFoundException("Role not found")
    }

    return role
  }
}
