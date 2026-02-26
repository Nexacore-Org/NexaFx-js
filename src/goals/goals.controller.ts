import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GoalsService } from './goals.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalResponseDto, GoalListResponseDto } from './dto/goal-response.dto';
import { GoalStatus } from './entities/goal.entity';
import { AuditLog } from '../modules/admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../modules/admin-audit/decorators/skip-audit.decorator';

// Import your auth guard - adjust path as needed
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('goals')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard) // Uncomment when you have authentication
@Controller('goals')
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new financial goal' })
  @ApiResponse({
    status: 201,
    description: 'Goal created successfully',
    type: GoalResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @AuditLog({
    action: 'CREATE_GOAL',
    entity: 'Goal',
    description: 'User created a new financial goal',
  })
  async create(
    @Request() req,
    @Body() createGoalDto: CreateGoalDto,
  ): Promise<GoalResponseDto> {
    // Get userId from authenticated user
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.create(userId, createGoalDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all goals for the authenticated user' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: GoalStatus,
    description: 'Filter goals by status',
  })
  @ApiResponse({
    status: 200,
    description: 'Goals retrieved successfully',
    type: GoalListResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @SkipAudit()
  async findAll(
    @Request() req,
    @Query('status') status?: GoalStatus,
  ): Promise<GoalListResponseDto> {
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.findAll(userId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a specific goal by ID' })
  @ApiParam({ name: 'id', description: 'Goal ID' })
  @ApiResponse({
    status: 200,
    description: 'Goal retrieved successfully',
    type: GoalResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your goal' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  @SkipAudit()
  async findOne(
    @Request() req,
    @Param('id') id: string,
  ): Promise<GoalResponseDto> {
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a goal' })
  @ApiParam({ name: 'id', description: 'Goal ID' })
  @ApiResponse({
    status: 200,
    description: 'Goal updated successfully',
    type: GoalResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your goal' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  @AuditLog({
    action: 'UPDATE_GOAL',
    entity: 'Goal',
    entityIdParam: 'id',
    description: 'User updated a financial goal',
  })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateGoalDto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.update(id, userId, updateGoalDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a goal' })
  @ApiParam({ name: 'id', description: 'Goal ID' })
  @ApiResponse({ status: 204, description: 'Goal deleted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your goal' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  @AuditLog({
    action: 'DELETE_GOAL',
    entity: 'Goal',
    entityIdParam: 'id',
    description: 'User deleted a financial goal',
  })
  async remove(@Request() req, @Param('id') id: string): Promise<void> {
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.remove(id, userId);
  }

  @Patch(':id/progress')
  @ApiOperation({ summary: 'Update goal progress by adding/subtracting an amount' })
  @ApiParam({ name: 'id', description: 'Goal ID' })
  @ApiResponse({
    status: 200,
    description: 'Progress updated successfully',
    type: GoalResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid amount or goal is not active' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your goal' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  @AuditLog({
    action: 'UPDATE_GOAL_PROGRESS',
    entity: 'Goal',
    entityIdParam: 'id',
    description: 'User updated goal progress',
  })
  async updateProgress(
    @Request() req,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ): Promise<GoalResponseDto> {
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.updateProgress(id, userId, amount);
  }

  @Post(':id/sync-wallet')
  @ApiOperation({ 
    summary: 'Sync goal progress with linked wallet balance',
    description: 'Updates goal progress based on the linked wallet balance'
  })
  @ApiParam({ name: 'id', description: 'Goal ID' })
  @ApiResponse({
    status: 200,
    description: 'Wallet sync completed successfully',
    type: GoalResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Goal is not linked to a wallet' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - not your goal' })
  @ApiResponse({ status: 404, description: 'Goal not found' })
  @AuditLog({
    action: 'SYNC_GOAL_WALLET',
    entity: 'Goal',
    entityIdParam: 'id',
    description: 'User synced goal progress with wallet',
  })
  async syncWalletProgress(
    @Request() req,
    @Param('id') id: string,
  ): Promise<GoalResponseDto> {
    const userId = req.user?.id || req.user?.userId || 'demo-user-id';
    return this.goalsService.calculateWalletProgress(id, userId);
  }
}