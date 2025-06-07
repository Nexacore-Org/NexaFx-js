import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger"
import type { KeyRotationService } from "../key-management/key-rotation.service"
import { Roles } from "../../rbac/decorators/roles.decorator"
import { RolesGuard } from "../../rbac/guards/roles.guard"

@ApiTags("Encryption Key Management")
@Controller("encryption/keys")
@UseGuards(RolesGuard)
@Roles("admin")
export class KeyManagementController {
  constructor(private readonly keyRotationService: KeyRotationService) {}

  @Get()
  @ApiOperation({ summary: "Get all encryption keys" })
  @ApiResponse({ status: 200, description: "List of encryption keys" })
  async getAllKeys() {
    const keys = await this.keyRotationService.getAllKeys()

    // Don't return the actual key values in the response
    return keys.map((key) => ({
      id: key.id,
      version: key.version,
      isActive: key.isActive,
      description: key.description,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      rotatedAt: key.rotatedAt,
    }))
  }

  @Get("current")
  @ApiOperation({ summary: "Get current active encryption key" })
  @ApiResponse({ status: 200, description: "Current active encryption key" })
  async getCurrentKey() {
    const key = await this.keyRotationService.getCurrentKey()

    if (!key) {
      return { message: "No active encryption key found" }
    }

    // Don't return the actual key value in the response
    return {
      id: key.id,
      version: key.version,
      isActive: key.isActive,
      description: key.description,
      createdAt: key.createdAt,
    }
  }

  @Post("rotate")
  @ApiOperation({ summary: "Rotate encryption keys" })
  @ApiResponse({ status: 201, description: "New encryption key created" })
  async rotateKeys(@Body() body: { deactivateOldKeys?: boolean }) {
    const newKey = await this.keyRotationService.rotateKeys(body.deactivateOldKeys)

    // Don't return the actual key value in the response
    return {
      id: newKey.id,
      version: newKey.version,
      isActive: newKey.isActive,
      description: newKey.description,
      createdAt: newKey.createdAt,
      message: "Encryption key rotated successfully"
    }
  }

  @Post()
  @ApiOperation({ summary: "Generate a new encryption key" })
  @ApiResponse({ status: 201, description: "New encryption key created" })
  async generateNewKey(@Body() body: { description?: string }) {
    const newKey = await this.keyRotationService.generateNewKey(body.description)
    
    // Don't return the actual key value in the response
    return {
      id: newKey.id,
      version: newKey.version,
      isActive: newKey.isActive,
      description: newKey.description,
      createdAt: newKey.createdAt,
      message: "New encryption key generated successfully"
    }
  }

  @Get(":id")
  @ApiOperation({ summary: "Get encryption key by ID" })
  @ApiResponse({ status: 200, description: "Encryption key details" })
  @ApiResponse({ status: 404, description: "Encryption key not found" })
  async getKeyById(@Param("id") id: string) {
    const key = await this.keyRotationService.getKeyById(id)
    
    if (!key) {
      return { message: "Encryption key not found" }
    }
    
    // Don't return the actual key value in the response
    return {
      id: key.id,
      version: key.version,
      isActive: key.isActive,
      description: key.description,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
      rotatedAt: key.rotatedAt
    }
  }
}
