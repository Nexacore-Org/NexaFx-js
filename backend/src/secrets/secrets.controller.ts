import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    UseGuards,
    HttpCode,
    HttpStatus,
    Query,
  } from '@nestjs/common';
  import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
  import { SecretsService } from './secrets.service';
  import { AdminGuard } from '../auth/guards/admin.guard';
  import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
  import {
    CreateSecretDto,
    UpdateSecretDto,
    RotateSecretDto,
    SecretResponseDto,
    PaginatedSecretsDto,
  } from './dto/secrets.dto';
  
  @ApiTags('secrets')
  @Controller('api/v1/secrets')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth()
  export class SecretsController {
    constructor(private readonly secretsService: SecretsService) {}
  
    @Get()
    @ApiOperation({ summary: 'Get all secrets (admin only)' })
    @ApiResponse({
      status: 200,
      description: 'List of secrets retrieved successfully',
      type: PaginatedSecretsDto,
    })
    async findAll(
      @Query('page') page = 1,
      @Query('limit') limit = 10,
      @Query('search') search?: string,
    ): Promise<PaginatedSecretsDto> {
      return this.secretsService.findAll({
        page: Number(page),
        limit: Number(limit),
        search,
      });
    }
  
    @Get(':id')
    @ApiOperation({ summary: 'Get secret by ID (admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Secret retrieved successfully',
      type: SecretResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Secret not found' })
    async findOne(@Param('id') id: string): Promise<SecretResponseDto> {
      return this.secretsService.findOne(id);
    }
  
    @Post()
    @ApiOperation({ summary: 'Create new secret (admin only)' })
    @ApiResponse({
      status: 201,
      description: 'Secret created successfully',
      type: SecretResponseDto,
    })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async create(@Body() createSecretDto: CreateSecretDto): Promise<SecretResponseDto> {
      return this.secretsService.create(createSecretDto);
    }
  
    @Put(':id')
    @ApiOperation({ summary: 'Update secret (admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Secret updated successfully',
      type: SecretResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Secret not found' })
    async update(
      @Param('id') id: string,
      @Body() updateSecretDto: UpdateSecretDto,
    ): Promise<SecretResponseDto> {
      return this.secretsService.update(id, updateSecretDto);
    }
  
    @Delete(':id')
    @HttpCode(HttpStatus.NO_CONTENT)
    @ApiOperation({ summary: 'Delete secret (admin only)' })
    @ApiResponse({ status: 204, description: 'Secret deleted successfully' })
    @ApiResponse({ status: 404, description: 'Secret not found' })
    async remove(@Param('id') id: string): Promise<void> {
      return this.secretsService.remove(id);
    }
  
    @Post(':id/rotate')
    @ApiOperation({ summary: 'Rotate secret key (admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Secret rotated successfully',
      type: SecretResponseDto,
    })
    @ApiResponse({ status: 404, description: 'Secret not found' })
    async rotate(
      @Param('id') id: string,
      @Body() rotateSecretDto: RotateSecretDto,
    ): Promise<SecretResponseDto> {
      return this.secretsService.rotate(id, rotateSecretDto);
    }
  
    @Post('bulk-rotate')
    @ApiOperation({ summary: 'Rotate multiple secrets (admin only)' })
    @ApiResponse({
      status: 200,
      description: 'Secrets rotated successfully',
      type: [SecretResponseDto],
    })
    async bulkRotate(
      @Body() rotateData: { secretIds: string[]; notifyServices?: boolean },
    ): Promise<SecretResponseDto[]> {
      return this.secretsService.bulkRotate(rotateData.secretIds, rotateData.notifyServices);
    }
  
    @Get(':id/affected-services')
    @ApiOperation({ summary: 'Get services affected by secret rotation' })
    @ApiResponse({
      status: 200,
      description: 'Affected services retrieved successfully',
    })
    async getAffectedServices(@Param('id') id: string) {
      return this.secretsService.getAffectedServices(id);
    }
  }