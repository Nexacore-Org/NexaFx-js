import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal, GoalStatus } from './entities/goal.entity';
import { GoalContribution } from './entities/goal-contribution.entity';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { GoalResponseDto, GoalListResponseDto } from './dto/goal-response.dto';
import {
  UpdateRoundUpRuleDto,
  GetContributionsDto,
  PaginatedContributionsDto,
  ContributionResponseDto,
} from './dto/round-up.dto';

@Injectable()
export class GoalsService {
  constructor(
    @InjectRepository(Goal)
    private readonly goalRepository: Repository<Goal>,
    @InjectRepository(GoalContribution)
    private readonly contributionRepository: Repository<GoalContribution>,
  ) {}

  async create(userId: string, createGoalDto: CreateGoalDto): Promise<GoalResponseDto> {
    // Validate deadline is in the future
    if (createGoalDto.deadline) {
      const deadlineDate = new Date(createGoalDto.deadline);
      if (deadlineDate <= new Date()) {
        throw new BadRequestException('Deadline must be in the future');
      }
    }

    // Validate current amount doesn't exceed target
    if (createGoalDto.currentAmount && createGoalDto.currentAmount > createGoalDto.targetAmount) {
      throw new BadRequestException('Current amount cannot exceed target amount');
    }

    const goal = this.goalRepository.create({
      ...createGoalDto,
      userId,
      currentAmount: createGoalDto.currentAmount || 0,
      currency: createGoalDto.currency || 'USD',
    });

    // Auto-complete if current amount meets target
    if (goal.currentAmount >= goal.targetAmount) {
      goal.status = GoalStatus.COMPLETED;
    }

    const savedGoal = await this.goalRepository.save(goal);
    return new GoalResponseDto(savedGoal);
  }

  async findAll(userId: string, status?: GoalStatus): Promise<GoalListResponseDto> {
    const queryBuilder = this.goalRepository
      .createQueryBuilder('goal')
      .where('goal.userId = :userId', { userId });

    if (status) {
      queryBuilder.andWhere('goal.status = :status', { status });
    }

    const goals = await queryBuilder
      .orderBy('goal.createdAt', 'DESC')
      .getMany();

    // Update expired goals
    await this.updateExpiredGoals(goals);

    // Calculate summary statistics
    const summary = this.calculateSummary(goals);

    return {
      goals: goals.map(goal => new GoalResponseDto(goal)),
      total: goals.length,
      summary,
    };
  }

  async findOne(id: string, userId: string): Promise<GoalResponseDto> {
    const goal = await this.goalRepository.findOne({
      where: { id },
    });

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    if (goal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    // Check if goal is expired and update if needed
    if (goal.isOverdue && goal.status === GoalStatus.ACTIVE) {
      goal.status = GoalStatus.EXPIRED;
      await this.goalRepository.save(goal);
    }

    return new GoalResponseDto(goal);
  }

  async update(
    id: string,
    userId: string,
    updateGoalDto: UpdateGoalDto,
  ): Promise<GoalResponseDto> {
    const goal = await this.goalRepository.findOne({
      where: { id },
    });

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    if (goal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    // Validate deadline if being updated
    if (updateGoalDto.deadline) {
      const deadlineDate = new Date(updateGoalDto.deadline);
      if (deadlineDate <= new Date()) {
        throw new BadRequestException('Deadline must be in the future');
      }
    }

    // Validate amounts if being updated
    const newTargetAmount = updateGoalDto.targetAmount ?? goal.targetAmount;
    const newCurrentAmount = updateGoalDto.currentAmount ?? goal.currentAmount;

    if (newCurrentAmount > newTargetAmount) {
      throw new BadRequestException('Current amount cannot exceed target amount');
    }

    // Update goal
    Object.assign(goal, updateGoalDto);

    // Auto-complete if current amount meets target
    if (goal.currentAmount >= goal.targetAmount && goal.status === GoalStatus.ACTIVE) {
      goal.status = GoalStatus.COMPLETED;
    }

    const updatedGoal = await this.goalRepository.save(goal);
    return new GoalResponseDto(updatedGoal);
  }

  async remove(id: string, userId: string): Promise<void> {
    const goal = await this.goalRepository.findOne({
      where: { id },
    });

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    if (goal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    await this.goalRepository.remove(goal);
  }

  async updateProgress(
    id: string,
    userId: string,
    amount: number,
  ): Promise<GoalResponseDto> {
    const goal = await this.goalRepository.findOne({
      where: { id },
    });

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${id} not found`);
    }

    if (goal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    if (goal.status !== GoalStatus.ACTIVE) {
      throw new BadRequestException('Cannot update progress for inactive goals');
    }

    goal.currentAmount = Number(goal.currentAmount) + amount;

    // Ensure current amount doesn't go negative
    if (goal.currentAmount < 0) {
      goal.currentAmount = 0;
    }

    // Auto-complete if target is reached
    if (goal.currentAmount >= goal.targetAmount) {
      goal.status = GoalStatus.COMPLETED;
    }

    const updatedGoal = await this.goalRepository.save(goal);
    return new GoalResponseDto(updatedGoal);
  }

  /**
   * Calculate progress for a goal linked to a wallet
   * This method would integrate with your wallet/transaction system
   */
  async calculateWalletProgress(
    goalId: string,
    userId: string,
  ): Promise<GoalResponseDto> {
    const goal = await this.goalRepository.findOne({
      where: { id: goalId },
    });

    if (!goal) {
      throw new NotFoundException(`Goal with ID ${goalId} not found`);
    }

    if (goal.userId !== userId) {
      throw new ForbiddenException('You do not have access to this goal');
    }

    if (!goal.linkedWalletId) {
      throw new BadRequestException('Goal is not linked to a wallet');
    }

    // TODO: Integrate with your wallet service to calculate actual balance
    // Example:
    // const walletBalance = await this.walletService.getBalance(goal.linkedWalletId, userId);
    // goal.currentAmount = walletBalance;

    // For now, this is a placeholder
    // You would replace this with actual wallet integration

    const updatedGoal = await this.goalRepository.save(goal);
    return new GoalResponseDto(updatedGoal);
  }

  private async updateExpiredGoals(goals: Goal[]): Promise<void> {
    const expiredGoals = goals.filter(
      goal => goal.isOverdue && goal.status === GoalStatus.ACTIVE,
    );

    if (expiredGoals.length > 0) {
      await Promise.all(
        expiredGoals.map(goal => {
          goal.status = GoalStatus.EXPIRED;
          return this.goalRepository.save(goal);
        }),
      );
    }
  }

  // ── Round-up rule ─────────────────────────────────────────────────────────

  async updateRoundUpRule(goalId: string, userId: string, dto: UpdateRoundUpRuleDto): Promise<Goal> {
    const goal = await this.goalRepository.findOne({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException(`Goal ${goalId} not found`);

    if (dto.enabled) {
      if (!dto.unit) throw new BadRequestException('round_up_unit is required when enabling round-up');
      if (!dto.linkedWalletId && !goal.linkedWalletId) {
        throw new BadRequestException('linkedWalletId is required when enabling round-up for the first time');
      }
      goal.roundUpEnabled = true;
      goal.roundUpUnit = dto.unit;
      if (dto.linkedWalletId) goal.linkedWalletId = dto.linkedWalletId;
    } else {
      goal.roundUpEnabled = false;
    }

    return this.goalRepository.save(goal);
  }

  // ── Contribution history ───────────────────────────────────────────────────

  async getContributions(goalId: string, userId: string, query: GetContributionsDto): Promise<PaginatedContributionsDto> {
    const goal = await this.goalRepository.findOne({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException(`Goal ${goalId} not found`);

    const { page = 1, limit = 20 } = query;
    const [rows, total] = await this.contributionRepository.findAndCount({
      where: { goalId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data: ContributionResponseDto[] = rows.map((c) => ({
      id: c.id,
      amount: c.amount,
      currency: c.currency,
      source: c.source,
      transactionId: c.transactionId,
      progressSnapshot: c.progressSnapshot,
      createdAt: c.createdAt,
    }));

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  // ── Goal completion workflow ───────────────────────────────────────────────

  async completeGoal(goalId: string, userId: string): Promise<Goal> {
    const goal = await this.goalRepository.findOne({ where: { id: goalId, userId } });
    if (!goal) throw new NotFoundException(`Goal ${goalId} not found`);
    if (goal.isCompleted) throw new BadRequestException('Goal is already completed');
    if (!goal.linkedWalletId) throw new BadRequestException('A linked wallet is required to complete this goal');

    const current = parseFloat(goal.currentAmount as any);
    const target = parseFloat(goal.targetAmount as any);
    if (current < target) {
      throw new BadRequestException(`Goal target not yet reached (${current} / ${target})`);
    }

    goal.isCompleted = true;
    goal.completedAt = new Date();
    goal.status = GoalStatus.COMPLETED;
    return this.goalRepository.save(goal);
  }

  private calculateSummary(goals: Goal[]) {
    const activeGoals = goals.filter(g => g.status === GoalStatus.ACTIVE);
    const completedGoals = goals.filter(g => g.status === GoalStatus.COMPLETED);

    const totalTargetAmount = goals.reduce((sum, goal) => sum + Number(goal.targetAmount), 0);
    const totalCurrentAmount = goals.reduce((sum, goal) => sum + Number(goal.currentAmount), 0);
    const averageProgress =
      goals.length > 0
        ? goals.reduce((sum, goal) => sum + goal.progressPercentage, 0) / goals.length
        : 0;

    return {
      active: activeGoals.length,
      completed: completedGoals.length,
      totalTargetAmount,
      totalCurrentAmount,
      averageProgress: Math.round(averageProgress * 100) / 100,
    };
  }
}