import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { RateLimitService } from '../services/rate-limit.service';
import { RateLimitRuleEntity } from '../entities/rate-limit-rule.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRateLimitRuleDto } from '../dto/create-rate-limit-rule.dto';
import { UpdateRateLimitRuleDto } from '../dto/update-rate-limit-rule.dto';

@Controller('admin/rate-limits')
@UseGuards(AdminGuard)
export class RateLimitAdminController {
  constructor(
    @InjectRepository(RateLimitRuleEntity)
    private readonly ruleRepository: Repository<RateLimitRuleEntity>,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Get('rules')
  async listRules(
    @Query('tier') tier?: string,
    @Query('isActive') isActive?: string,
  ): Promise<{ success: boolean; data: RateLimitRuleEntity[] }> {
    const query = this.ruleRepository.createQueryBuilder('rule');

    if (tier) {
      query.andWhere('rule.tier = :tier', { tier });
    }

    if (isActive !== undefined) {
      query.andWhere('rule.isActive = :isActive', {
        isActive: isActive === 'true',
      });
    }

    query.orderBy('rule.priority', 'DESC').addOrderBy('rule.createdAt', 'DESC');

    const rules = await query.getMany();

    return {
      success: true,
      data: rules,
    };
  }

  @Get('rules/:id')
  async getRule(
    @Param('id') id: string,
  ): Promise<{ success: boolean; data: RateLimitRuleEntity }> {
    const rule = await this.ruleRepository.findOne({ where: { id } });

    if (!rule) {
      throw new NotFoundException(`Rate limit rule with ID ${id} not found`);
    }

    return {
      success: true,
      data: rule,
    };
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  async createRule(
    @Body() createDto: CreateRateLimitRuleDto,
  ): Promise<{ success: boolean; data: RateLimitRuleEntity }> {
    const rule = this.ruleRepository.create({
      ...createDto,
      isActive: createDto.isActive ?? true,
      priority: createDto.priority ?? 0,
    });

    const saved = await this.ruleRepository.save(rule);

    return {
      success: true,
      data: saved,
    };
  }

  @Put('rules/:id')
  async updateRule(
    @Param('id') id: string,
    @Body() updateDto: UpdateRateLimitRuleDto,
  ): Promise<{ success: boolean; data: RateLimitRuleEntity }> {
    const rule = await this.ruleRepository.findOne({ where: { id } });

    if (!rule) {
      throw new NotFoundException(`Rate limit rule with ID ${id} not found`);
    }

    Object.assign(rule, updateDto);
    const updated = await this.ruleRepository.save(rule);

    return {
      success: true,
      data: updated,
    };
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param('id') id: string): Promise<void> {
    const result = await this.ruleRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Rate limit rule with ID ${id} not found`);
    }
  }

  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  async cleanupTrackers(): Promise<{
    success: boolean;
    message: string;
    deletedCount: number;
  }> {
    const deletedCount = await this.rateLimitService.cleanupExpiredTrackers();

    return {
      success: true,
      message: `Cleaned up ${deletedCount} expired trackers`,
      deletedCount,
    };
  }
}
