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
import { ApiKeysService } from '../services/api-keys.service';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('API Keys')
@ApiBearerAuth('access-token')
@Controller('api/v1/api-keys')
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
      data: {
        ...apiKey,
        key: plainKey,
      },
      message: 'Store this key securely. It will not be shown again.',
    };
  }

  @Get()
  @ApiOperation({ summary: 'List API keys for current user' })
  async list(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const keys = await this.apiKeysService.getApiKeysByUser(userId);
    return { success: true, data: keys };
  }

  @Patch(':id/revoke')
  @ApiOperation({ summary: 'Revoke an API key' })
  async revoke(@Param('id', new ParseUUIDPipe()) id: string, @Request() req: any) {
    const userId = req.user?.id || req.user?.sub;
    const key = await this.apiKeysService.revokeApiKey(id, userId);
    return { success: true, data: key };
  }
}
