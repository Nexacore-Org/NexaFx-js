// src/saving-goals/goals.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Goal } from '../goals/entities/goal.entity';
import { GoalContribution } from '../goals/entities/goal-contribution.entity';

import { RoundUpService } from './round-up.service';
import { WalletsModule } from '../modules/wallets/wallets.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Goal, GoalContribution]),
    WalletsModule,
  ],
  providers: [RoundUpService],
  exports: [RoundUpService],
})
export class SavingGoalsModule {}
