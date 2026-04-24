import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiHeader,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { ApiKeyService, GenerateApiKeyDto } from '../services/api-key.service';
import { ApiKeyGuard } from '../guards/api-key.guard';
import { ApiKeyScopeGuard } from '../guards/api-key-scope.guard';
import { RequireScopes } from '../decorators/require-scopes.decorator';

@ApiTags('API Keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin/api-keys')
export class ApiKeyController {
  private readonly logger = new Logger(ApiKeyController.name);

  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new API key' })
  @ApiResponse({ status: 201, description: 'API key generated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request body' })
  async generateKey(@Body() dto: GenerateApiKeyDto) {
    const { apiKey, rawKey } = await this.apiKeyService.generateKey(dto);

    this.logger.log(`New API key generated: ${apiKey.name} by admin`);

    return {
      message: 'API key generated successfully. Store the rawKey securely - it cannot be retrieved again.',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      rawKey, // Returned ONCE only
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys' })
  @ApiResponse({ status: 200, description: 'List of API keys' })
  async listKeys() {
    const keys = await this.apiKeyService.listKeys();
    return { data: keys, count: keys.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key details' })
  @ApiResponse({ status: 200, description: 'API key details' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async getKey(@Param('id') id: string) {
    const key = await this.apiKeyService.getKeyById(id);
    return { data: key };
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key' })
  @ApiResponse({ status: 200, description: 'API key revoked' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revokeKey(@Param('id') id: string) {
    const key = await this.apiKeyService.revokeKey(id);
    this.logger.log(`API key revoked: ${key.name} (${key.prefix}...)`);
    return { message: 'API key revoked successfully', data: key };
  }

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key (old key has 5-min grace period)' })
  @ApiResponse({ status: 200, description: 'API key rotated successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async rotateKey(@Param('id') id: string, @Body('name') newName?: string) {
    const { apiKey, rawKey } = await this.apiKeyService.rotateKey(id, newName);
    
    this.logger.log(`API key rotated: ${apiKey.name}`);

    return {
      message: 'API key rotated successfully. The old key will remain active for 5 minutes.',
      apiKey: {
        id: apiKey.id,
        name: apiKey.name,
        prefix: apiKey.prefix,
        scopes: apiKey.scopes,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
      rawKey, // New raw key returned ONCE only
    };
  }
}

// Example controller showing how to use API key authentication for service-to-service endpoints
@ApiTags('Webhooks (API Key Auth Example)')
@ApiHeader({ name: 'X-API-Key', required: true, description: 'API key for authentication' })
@UseGuards(ApiKeyGuard, ApiKeyScopeGuard)
@Controller('webhooks')
export class WebhookExampleController {
  @Post('payment')
  @RequireScopes('webhook:write', 'payment:write')
  @ApiOperation({ summary: 'Example webhook endpoint with API key auth' })
  async handlePaymentWebhook() {
    return { message: 'Webhook processed successfully' };
  }

  @Get('status')
  @RequireScopes('webhook:read')
  @ApiOperation({ summary: 'Example read endpoint with API key auth' })
  async getWebhookStatus() {
    return { status: 'active' };
  }
}
