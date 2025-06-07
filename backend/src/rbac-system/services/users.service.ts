import { Injectable, NotFoundException, ConflictException } from "@nestjs/common"
import type { Repository } from "typeorm"
import { User } from "../entities/user.entity"
import type { Role } from "../entities/role.entity"
import type { CreateUserDto } from "../dto/create-user.dto"
import type { UpdateUserDto } from "../dto/update-user.dto"
import * as bcrypt from "bcrypt"

@Injectable()
export class UsersService {
  constructor(
    private readonly userRepository: Repository<User>,
    private readonly roleRepository: Repository<Role>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email },
    })

    if (existingUser) {
      throw new ConflictException("User with this email already exists")
    }

    const user = new User()
    user.email = createUserDto.email
    user.firstName = createUserDto.firstName
    user.lastName = createUserDto.lastName
    user.passwordHash = await bcrypt.hash(createUserDto.password, 10)
    user.department = createUserDto.department
    user.metadata = createUserDto.metadata

    // Assign roles if provided
    if (createUserDto.roleIds && createUserDto.roleIds.length > 0) {
      const roles = await this.roleRepository.findByIds(createUserDto.roleIds)
      user.roles = roles
    }

    return this.userRepository.save(user)
  }

  async findAll(): Promise<User[]> {
    return this.userRepository.find({
      relations: ["roles", "roles.permissions"],
      order: { createdAt: "DESC" },
    })
  }

  async findOne(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ["roles", "roles.permissions"],
    })

    if (!user) {
      throw new NotFoundException("User not found")
    }

    return user
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email },
      relations: ["roles", "roles.permissions"],
    })
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id)

    Object.assign(user, updateUserDto)

    // Update roles if provided
    if (updateUserDto.roleIds) {
      const roles = await this.roleRepository.findByIds(updateUserDto.roleIds)
      user.roles = roles
    }

    return this.userRepository.save(user)
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id)
    await this.userRepository.remove(user)
  }

  async assignRoles(userId: string, roleIds: string[]): Promise<User> {
    const user = await this.findOne(userId)
    const roles = await this.roleRepository.findByIds(roleIds)

    if (roles.length !== roleIds.length) {
      throw new NotFoundException("One or more roles not found")
    }

    user.roles = roles
    return this.userRepository.save(user)
  }

  async addRoles(userId: string, roleIds: string[]): Promise<User> {
    const user = await this.findOne(userId)
    const newRoles = await this.roleRepository.findByIds(roleIds)

    if (newRoles.length !== roleIds.length) {
      throw new NotFoundException("One or more roles not found")
    }

    // Add new roles to existing ones
    const existingRoleIds = user.roles.map((role) => role.id)
    const rolesToAdd = newRoles.filter((role) => !existingRoleIds.includes(role.id))

    user.roles = [...user.roles, ...rolesToAdd]
    return this.userRepository.save(user)
  }

  async removeRoles(userId: string, roleIds: string[]): Promise<User> {
    const user = await this.findOne(userId)
    user.roles = user.roles.filter((role) => !roleIds.includes(role.id))
    return this.userRepository.save(user)
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update(userId, { lastLoginAt: new Date() })
  }

  async validatePassword(user: User, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.passwordHash)
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await this.userRepository.update(userId, { passwordHash })
  }
}
