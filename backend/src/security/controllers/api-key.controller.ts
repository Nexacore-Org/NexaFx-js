import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiKeyService } from '../services/api-key.service';
import { AdminGuard } from '../../backup/guards/admin.guard';

class GenerateApiKeyDto {
  userId: string;
  name: string;
  permissions?: string[];
  expiresInDays?: number;
}

@Controller('security/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post('generate')
  @UseGuards(AdminGuard)
  async generateApiKey(@Body() dto: GenerateApiKeyDto) {
    const result = await this.apiKeyService.generateApiKey(
      dto.userId,
      dto.name,
      dto.permissions,
      dto.expiresInDays,
    );

    return {
      success: true,
      message: 'API key generated successfully',
      apiKey: result.apiKey,
      keyInfo: {
        id: result.keyData.id,
        prefix: result.keyData.prefix,
        name: result.keyData.name,
        createdAt: result.keyData.createdAt,
        expiresAt: result.keyData.expiresAt,
      },
    };
  }

  @Get(':userId')
  @UseGuards(AdminGuard)
  async getUserApiKeys(@Param('userId') userId: string) {
    const keys = await this.apiKeyService.getUserApiKeys(userId);

    const sanitizedKeys = keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      lastUsedAt: key.lastUsedAt,
      expiresAt: key.expiresAt,
      isActive: key.isActive,
      permissions: key.permissions,
    }));

    return {
      success: true,
      count: sanitizedKeys.length,
      data: sanitizedKeys,
    };
  }

  @Delete(':keyId')
  @UseGuards(AdminGuard)
  async revokeApiKey(@Param('keyId') keyId: string) {
    await this.apiKeyService.revokeApiKey(keyId);

    return {
      success: true,
      message: `API key ${keyId} has been revoked`,
    };
  }

  @Post(':keyId/rotate')
  @UseGuards(AdminGuard)
  async rotateApiKey(@Param('keyId') keyId: string) {
    const result = await this.apiKeyService.rotateApiKey(keyId);

    if (!result) {
      return {
        success: false,
        message: 'API key not found',
      };
    }

    return {
      success: true,
      message: 'API key rotated successfully',
      apiKey: result.apiKey,
      keyInfo: {
        id: result.keyData.id,
        prefix: result.keyData.prefix,
        name: result.keyData.name,
        createdAt: result.keyData.createdAt,
        expiresAt: result.keyData.expiresAt,
      },
    };
  }
}
