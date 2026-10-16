import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ApiKeysService, toApiKeyView } from '../services/api-keys.service';
import { ApiKeyAllowed } from '../api-key-scopes';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('API Keys')
@ApiBearerAuth('access-token')
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  async create(@Body() dto: CreateApiKeyDto, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const { apiKey, plainKey } = await this.apiKeysService.createApiKey(userId, {
      name: dto.name,
      scopes: dto.scopes,
      rateLimit: dto.rateLimit,
      expiresAt: dto.expiresAt,
    });
    return {
      success: true,
      // The hash is never returned; the plain key is shown exactly once.
      data: {
        ...toApiKeyView(apiKey),
        key: plainKey,
      },
      message: 'Store this key securely. It will not be shown again.',
    };
  }

  /**
   * Introspect the key used for this request. Routes opt in to API-key access
   * with `@ApiKeyAllowed(<scopes>)`; only do that for handlers that derive the
   * acting user from `request.user` and not from a body/query parameter.
   */
  @Get('me')
  @ApiKeyAllowed()
  @ApiOperation({ summary: 'Describe the authenticated principal (JWT or API key)' })
  me(@Request() req: any) {
    const { id, authMethod, scopes, apiKeyId } = req.user ?? {};
    return { success: true, data: { userId: id, authMethod: authMethod ?? 'jwt', scopes: scopes ?? [], apiKeyId: apiKeyId ?? null } };
  }

  @Get()
  @ApiOperation({ summary: 'List API keys for current user' })
  async list(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const keys = await this.apiKeysService.getApiKeysByUser(userId);
    return { success: true, data: keys.map(toApiKeyView) };
  }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id', new ParseUUIDPipe()) id: string, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const key = await this.apiKeysService.revokeApiKey(id, userId);
    return { success: true, data: toApiKeyView(key) };
  }
}
