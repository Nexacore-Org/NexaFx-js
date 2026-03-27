import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsBoolean, IsNumber, IsObject, IsOptional, IsPositive, IsString } from 'class-validator';
import { AmlRulesService } from '../services/aml-rules.service';
import { AmlRuleType } from '../entities/aml-rule.entity';
import { ComplianceCaseService } from '../services/compliance-case.service';
import { ComplianceCaseStatus } from '../entities/compliance-case.entity';

class CreateAmlRuleDto {
  @IsString()
  ruleType: AmlRuleType;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsObject()
  thresholds: Record<string, number>;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  riskScoreWeight?: number;
}

class UpdateAmlRuleDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  thresholds?: Record<string, number>;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  riskScoreWeight?: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

class UpdateCaseStatusDto {
  @IsString()
  status: ComplianceCaseStatus;

  @IsString()
  reviewedBy: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

@Controller('admin/aml')
export class AmlAdminController {
  constructor(
    private readonly amlRulesService: AmlRulesService,
    private readonly complianceCaseService: ComplianceCaseService,
  ) {}

  // ─── AML Rules ─────────────────────────────────────────────────────────────

  @Get('rules')
  listRules() {
    return this.amlRulesService.findAll();
  }

  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  createRule(@Body() dto: CreateAmlRuleDto) {
    return this.amlRulesService.createRule(dto);
  }

  @Patch('rules/:id')
  updateRule(@Param('id') id: string, @Body() dto: UpdateAmlRuleDto) {
    return this.amlRulesService.updateRule(id, dto);
  }

  // ─── Compliance Cases ──────────────────────────────────────────────────────

  @Get('cases')
  listCases(
    @Query('userId') userId?: string,
    @Query('ruleTriggered') ruleTriggered?: string,
    @Query('status') status?: ComplianceCaseStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.complianceCaseService.findCases({
      userId,
      ruleTriggered,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    });
  }

  @Patch('cases/:id/status')
  updateCaseStatus(@Param('id') id: string, @Body() dto: UpdateCaseStatusDto) {
    return this.complianceCaseService.updateStatus(id, dto.status, dto.reviewedBy, dto.notes);
  }
}
