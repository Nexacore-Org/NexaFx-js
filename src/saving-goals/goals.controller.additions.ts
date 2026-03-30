// src/goals/goals.controller.ts — ADD these endpoints to your existing controller

import {
  Controller,
  Patch,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GoalsService } from './goals.service';
import { UpdateRoundUpRuleDto, GetContributionsDto, PaginatedContributionsDto } from './dto/round-up.dto';

// ─── New endpoints (paste inside your existing GoalsController) ───────────────

@ApiTags('Goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsControllerAdditions {
  constructor(private readonly goalsService: GoalsService) {}

  // PATCH /goals/:id/round-up-rule
  @Patch(':id/round-up-rule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable or disable automatic round-up contributions for a goal' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiOkResponse({ description: 'Round-up rule updated' })
  updateRoundUpRule(
    @Param('id', ParseUUIDPipe) goalId: string,
    @Body() dto: UpdateRoundUpRuleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.goalsService.updateRoundUpRule(goalId, userId, dto);
  }

  // GET /goals/:id/contributions
  @Get(':id/contributions')
  @ApiOperation({ summary: 'Get paginated contribution history for a goal' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  @ApiOkResponse({ type: PaginatedContributionsDto })
  getContributions(
    @Param('id', ParseUUIDPipe) goalId: string,
    @Query() query: GetContributionsDto,
    @CurrentUser('id') userId: string,
  ): Promise<PaginatedContributionsDto> {
    return this.goalsService.getContributions(goalId, userId, query);
  }

  // POST /goals/:id/complete  (manual completion trigger with wallet enforcement)
  @Patch(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a goal as completed (requires linked wallet)' })
  @ApiParam({ name: 'id', description: 'Goal UUID' })
  completeGoal(
    @Param('id', ParseUUIDPipe) goalId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.goalsService.completeGoal(goalId, userId);
  }
}
