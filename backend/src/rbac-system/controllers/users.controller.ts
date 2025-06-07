import { Controller, Get, Post, Body, Patch, Param, Delete, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger"
import type { UsersService } from "../services/users.service"
import type { CreateUserDto } from "../dto/create-user.dto"
import type { UpdateUserDto } from "../dto/update-user.dto"
import type { AssignRolesDto } from "../dto/assign-roles.dto"

@ApiTags("Users")
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: "Create a new user" })
  @ApiResponse({ status: 201, description: "User created successfully" })
  @ApiResponse({ status: 400, description: "Bad request" })
  @ApiResponse({ status: 409, description: "User already exists" })
  async create(@Body() createUserDto: CreateUserDto) {
    const user = await this.usersService.create(createUserDto);
    // Remove password hash from response
    const { passwordHash, ...userResponse } = user;
    return userResponse;
  }

  @Get()
  @ApiOperation({ summary: "Get all users" })
  @ApiResponse({ status: 200, description: "List of users" })
  async findAll() {
    const users = await this.usersService.findAll()
    // Remove password hashes from response
    return users.map(({ passwordHash, ...user }) => user)
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({ status: 200, description: "User details" })
  @ApiResponse({ status: 404, description: "User not found" })
  async findOne(@Param("id") id: string) {
    const user = await this.usersService.findOne(id)
    const { passwordHash, ...userResponse } = user
    return userResponse
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update user" })
  @ApiResponse({ status: 200, description: "User updated successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  async update(@Param("id") id: string, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.usersService.update(id, updateUserDto)
    const { passwordHash, ...userResponse } = user
    return userResponse
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete user" })
  @ApiResponse({ status: 204, description: "User deleted successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.usersService.remove(id)
  }

  @Post(":id/roles")
  @ApiOperation({ summary: "Assign roles to user" })
  @ApiResponse({ status: 200, description: "Roles assigned successfully" })
  @ApiResponse({ status: 404, description: "User or roles not found" })
  async assignRoles(@Param("id") id: string, @Body() assignRolesDto: AssignRolesDto) {
    const user = await this.usersService.assignRoles(id, assignRolesDto.roleIds)
    const { passwordHash, ...userResponse } = user
    return userResponse
  }

  @Post(":id/roles/add")
  @ApiOperation({ summary: "Add roles to user" })
  @ApiResponse({ status: 200, description: "Roles added successfully" })
  @ApiResponse({ status: 404, description: "User or roles not found" })
  async addRoles(@Param("id") id: string, @Body() assignRolesDto: AssignRolesDto) {
    const user = await this.usersService.addRoles(id, assignRolesDto.roleIds)
    const { passwordHash, ...userResponse } = user
    return userResponse
  }

  @Post(":id/roles/remove")
  @ApiOperation({ summary: "Remove roles from user" })
  @ApiResponse({ status: 200, description: "Roles removed successfully" })
  @ApiResponse({ status: 404, description: "User not found" })
  async removeRoles(@Param("id") id: string, @Body() assignRolesDto: AssignRolesDto) {
    const user = await this.usersService.removeRoles(id, assignRolesDto.roleIds)
    const { passwordHash, ...userResponse } = user
    return userResponse
  }

  @Get(":id/permissions")
  @ApiOperation({ summary: "Get user permissions" })
  @ApiResponse({ status: 200, description: "User permissions" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getUserPermissions(@Param("id") id: string) {
    const user = await this.usersService.findOne(id)
    return {
      userId: id,
      permissions: user.getAllPermissions(),
      roles: user.roles.map(role => ({
        id: role.id,
        name: role.name,
        displayName: role.displayName
      }))
    }
  }
}
