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
import { FeatureFlagsService } from '../services/feature-flags.service';
import { CreateFeatureFlagDto } from '../dto/create-feature-flag.dto';
import { UpdateFeatureFlagDto } from '../dto/update-feature-flag.dto';
import { FeatureFlagEntity } from '../entities/feature-flag.entity';
import { AdminGuard } from 'src/modules/auth/guards/admin.guard';

@Controller('admin/feature-flags')
@UseGuards(AdminGuard)
export class FeatureFlagsAdminController {
  constructor(private readonly featureFlagsService: FeatureFlagsService) {}

  @Get()
  async getAllFlags(): Promise<FeatureFlagEntity[]> {
    return this.featureFlagsService.getAllFlags();
  }

  @Get(':id')
  async getFlagById(
    @Param('id') id: string,
  ): Promise<FeatureFlagEntity | null> {
    return this.featureFlagsService.getFlagById(id);
  }

  @Post()
  @HttpCode(201)
  async createFlag(
    @Body() dto: CreateFeatureFlagDto,
  ): Promise<FeatureFlagEntity> {
    return this.featureFlagsService.createFlag(dto);
  }

  @Patch(':id')
  async updateFlag(
    @Param('id') id: string,
    @Body() dto: UpdateFeatureFlagDto,
  ): Promise<FeatureFlagEntity> {
    return this.featureFlagsService.updateFlag(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteFlag(@Param('id') id: string): Promise<void> {
    return this.featureFlagsService.deleteFlag(id);
  }
}
