// src/goals/goals.service.ts  — ADD / REPLACE these methods in your existing service

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Goal } from './entities/goal.entity';
import { GoalContribution } from './entities/goal-contribution.entity';
import { UpdateRoundUpRuleDto } from './dto/round-up.dto';
import {
  GetContributionsDto,
  PaginatedContributionsDto,
  ContributionResponseDto,
} from './dto/round-up.dto';

// ─── Service additions ────────────────────────────────────────────────────────
// Paste these methods inside your existing GoalsService class.
// Also inject GoalContribution repo via the constructor.

/*
  constructor(
    @InjectRepository(Goal)
    private readonly goalRepo: Repository<Goal>,
    @InjectRepository(GoalContribution)                  // ← add this
    private readonly contributionRepo: Repository<GoalContribution>,
  ) {}
*/

export class GoalsServiceAdditions {
  // ─── Round-up rule ───────────────────────────────────────────────────────────

  async updateRoundUpRule(
    goalId: string,
    userId: string,
    dto: UpdateRoundUpRuleDto,
  ): Promise<Goal> {
    const goal = await this.findOwnedGoalOrThrow(goalId, userId);

    if (dto.enabled) {
      if (!dto.unit) {
        throw new BadRequestException(
          'round_up_unit is required when enabling round-up (1, 5, or 10)',
        );
      }
      if (!dto.linkedWalletId && !goal.linkedWalletId) {
        throw new BadRequestException(
          'linkedWalletId is required when enabling round-up for the first time',
        );
      }
      goal.roundUpEnabled = true;
      goal.roundUpUnit = dto.unit;
      if (dto.linkedWalletId) goal.linkedWalletId = dto.linkedWalletId;
    } else {
      goal.roundUpEnabled = false;
    }

    return this.goalRepo.save(goal);
  }

  // ─── Contribution history ────────────────────────────────────────────────────

  async getContributions(
    goalId: string,
    userId: string,
    query: GetContributionsDto,
  ): Promise<PaginatedContributionsDto> {
    await this.findOwnedGoalOrThrow(goalId, userId);

    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const [rows, total] = await this.contributionRepo.findAndCount({
      where: { goalId },
      order: { createdAt: 'DESC' },
      skip,
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

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  // ─── Goal completion workflow ────────────────────────────────────────────────

  async completeGoal(goalId: string, userId: string): Promise<Goal> {
    const goal = await this.findOwnedGoalOrThrow(goalId, userId);

    if (goal.isCompleted) {
      throw new BadRequestException('Goal is already completed');
    }

    if (!goal.linkedWalletId) {
      throw new BadRequestException(
        'A linked wallet is required to complete this goal',
      );
    }

    const current = parseFloat(goal.currentAmount);
    const target = parseFloat(goal.targetAmount);
    if (current < target) {
      throw new BadRequestException(
        `Goal target not yet reached (${current} / ${target})`,
      );
    }

    goal.isCompleted = true;
    goal.completedAt = new Date();
    return this.goalRepo.save(goal);
  }

  // ─── Private helper ──────────────────────────────────────────────────────────

  private async findOwnedGoalOrThrow(goalId: string, userId: string): Promise<Goal> {
    const goal = await this.goalRepo.findOne({ where: { id: goalId, userId } });
    if (!goal) {
      throw new NotFoundException(`Goal ${goalId} not found`);
    }
    return goal;
  }
}
