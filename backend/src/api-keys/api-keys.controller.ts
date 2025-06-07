import { Controller, Get, Post, Body, Patch, Param, Delete, Query, HttpCode, HttpStatus } from "@nestjs/common"
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger"
import type { ApiKeysService } from "./api-keys.service"
import type { CreateApiKeyDto } from "./dto/create-api-key.dto"
import type { UpdateApiKeyDto } from "./dto/update-api-key.dto"
import { ApiKeyResponseDto, CreateApiKeyResponseDto } from "./dto/api-key-response.dto"

@ApiTags("API Keys")
@Controller("api-keys")
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new API key' })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    type: CreateApiKeyResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 409, description: 'API key already exists' })
  async create(@Body() createApiKeyDto: CreateApiKeyDto): Promise<CreateApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.create(createApiKeyDto);

    // Return response without sensitive information for listing
    return {
      id: apiKey.id,
      key: apiKey.key, // Only show full key on creation
      name: apiKey.name,
      description: apiKey.description,
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt,
      scopes: apiKey.scopes,
      userId: apiKey.userId,
      createdAt: apiKey.createdAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all API keys' })
  @ApiQuery({ name: 'userId', required: false, description: 'Filter by user ID' })
  @ApiResponse({
    status: 200,
    description: 'List of API keys',
    type: [ApiKeyResponseDto],
  })
  async findAll(@Query('userId') userId?: string): Promise<ApiKeyResponseDto[]> {
    const apiKeys = await this.apiKeysService.findAll(userId);
    
    // Mask the API keys in the response for security
    return apiKeys.map(apiKey => ({
      ...apiKey,
      key: this.maskApiKey(apiKey.key),
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get API key by ID' })
  @ApiResponse({
    status: 200,
    description: 'API key details',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async findOne(@Param('id') id: string): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.findOne(id);
    
    return {
      ...apiKey,
      key: this.maskApiKey(apiKey.key),
    };
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update API key" })
  @ApiResponse({
    status: 200,
    description: "API key updated successfully",
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: "API key not found" })
  async update(@Param('id') id: string, @Body() updateApiKeyDto: UpdateApiKeyDto): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.update(id, updateApiKeyDto)

    return {
      ...apiKey,
      key: this.maskApiKey(apiKey.key),
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete API key' })
  @ApiResponse({ status: 204, description: 'API key deleted successfully' })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.apiKeysService.remove(id);
  }

  @Post(':id/revoke')
  @ApiOperation({ summary: 'Revoke API key' })
  @ApiResponse({
    status: 200,
    description: 'API key revoked successfully',
    type: ApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async revoke(@Param('id') id: string): Promise<ApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.revokeApiKey(id);
    
    return {
      ...apiKey,
      key: this.maskApiKey(apiKey.key),
    };
  }

  @Post(':id/regenerate')
  @ApiOperation({ summary: 'Regenerate API key' })
  @ApiResponse({
    status: 200,
    description: 'API key regenerated successfully',
    type: CreateApiKeyResponseDto,
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async regenerate(@Param('id') id: string): Promise<CreateApiKeyResponseDto> {
    const apiKey = await this.apiKeysService.regenerateApiKey(id);
    
    return {
      id: apiKey.id,
      key: apiKey.key, // Show full key on regeneration
      name: apiKey.name,
      description: apiKey.description,
      isActive: apiKey.isActive,
      expiresAt: apiKey.expiresAt,
      scopes: apiKey.scopes,
      userId: apiKey.userId,
      createdAt: apiKey.createdAt,
    };
  }

  @Get(':id/usage')
  @ApiOperation({ summary: 'Get API key usage statistics' })
  @ApiResponse({
    status: 200,
    description: 'API key usage statistics',
  })
  @ApiResponse({ status: 404, description: 'API key not found' })
  async getUsage(@Param('id') id: string) {
    return this.apiKeysService.getUsageStats(id);
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) return key
    const prefix = key.substring(0, 8)
    const suffix = key.substring(key.length - 4)
    return `${prefix}${"*".repeat(key.length - 12)}${suffix}`
  }
}
