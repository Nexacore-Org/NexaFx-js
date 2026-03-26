import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse, ApiCreatedResponse, ApiParam } from '@nestjs/swagger';
import { FeatureFlagsService } from '../services/feature-flags.service';
import { FeatureFlagEvaluationService } from '../services/feature-flag-evaluation.service';
import { CreateFeatureFlagDto } from '../dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from '../dto/update-feature-flag.dto';
import { FeatureFlagEntity } from '../entities/feature-flag.entity';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';

@ApiTags('Admin - Feature Flags')
@ApiBearerAuth('access-token')
@Controller('admin/feature-flags')
@UseGuards(AdminGuard)
export class FeatureFlagsAdminController {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly evaluationService: FeatureFlagEvaluationService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all feature flags' })
  @ApiOkResponse({ description: 'List of feature flags', type: [FeatureFlagEntity] })
  async getAllFlags(): Promise<FeatureFlagEntity[]> {
    return this.featureFlagsService.getAllFlags();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a feature flag by ID' })
  @ApiParam({ name: 'id', description: 'Feature flag UUID' })
  @ApiOkResponse({ description: 'Feature flag', type: FeatureFlagEntity })
  async getFlagById(
    @Param('id') id: string,
  ): Promise<FeatureFlagEntity | null> {
    return this.featureFlagsService.getFlagById(id);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a feature flag' })
  @ApiCreatedResponse({ description: 'Feature flag created', type: FeatureFlagEntity })
  async createFlag(
    @Body() dto: CreateFeatureFlagDto,
  ): Promise<FeatureFlagEntity> {
    return this.featureFlagsService.createFlag(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a feature flag' })
  @ApiParam({ name: 'id', description: 'Feature flag UUID' })
  @ApiOkResponse({ description: 'Updated feature flag', type: FeatureFlagEntity })
  async updateFlag(
    @Param('id') id: string,
    @Body() dto: UpdateFeatureFlagDto,
  ): Promise<FeatureFlagEntity> {
    return this.featureFlagsService.updateFlag(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a feature flag' })
  @ApiParam({ name: 'id', description: 'Feature flag UUID' })
  async deleteFlag(@Param('id') id: string): Promise<void> {
    return this.featureFlagsService.deleteFlag(id);
  }

  @Get(':id/analytics')
  @ApiOperation({ summary: 'Get evaluation analytics for a feature flag' })
  @ApiParam({ name: 'id', description: 'Feature flag UUID' })
  @ApiOkResponse({ description: 'Evaluation count and % enabled users' })
  async getAnalytics(@Param('id') id: string) {
    return this.evaluationService.getAnalytics(id);
  }
}
