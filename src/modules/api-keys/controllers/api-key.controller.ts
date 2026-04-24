import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ApiKeyService } from '../services/api-key.service';
import { CreateApiKeyDto } from '../dto/create-api-key.dto';

@ApiTags('Admin — API Keys')
@ApiBearerAuth()
@Controller('admin/api-keys')
export class ApiKeyController {
  constructor(private readonly apiKeyService: ApiKeyService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new API key — plaintext returned once only' })
  @ApiResponse({ status: 201, description: 'API key created. Store the plaintext key securely.' })
  async create(@Body() dto: CreateApiKeyDto, @Req() req: any) {
    const createdBy = req.user?.id ?? 'system';
    const { apiKey, plaintext } = await this.apiKeyService.create(dto, createdBy);
    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      // Plaintext returned ONCE — not stored
      key: plaintext,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all API keys (without plaintext)' })
  findAll() {
    return this.apiKeyService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single API key' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.apiKeyService.findOne(id);
  }

  @Delete(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an API key immediately' })
  revoke(@Param('id', ParseUUIDPipe) id: string) {
    return this.apiKeyService.revoke(id);
  }

  @Post(':id/rotate')
  @ApiOperation({ summary: 'Rotate an API key — old key valid for 5 minutes' })
  async rotate(@Param('id', ParseUUIDPipe) id: string, @Req() req: any) {
    const createdBy = req.user?.id ?? 'system';
    const { apiKey, plaintext } = await this.apiKeyService.rotate(id, createdBy);
    return {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.prefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      createdAt: apiKey.createdAt,
      key: plaintext,
    };
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get usage logs for an API key' })
  getUsage(@Param('id', ParseUUIDPipe) id: string) {
    return this.apiKeyService.getUsageLogs(id);
  }
}
