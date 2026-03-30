// src/goals/goals.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { Goal } from './entities/goal.entity';
import { GoalContribution } from './entities/goal-contribution.entity';

import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';
import { RoundUpService } from './services/round-up.service';
import { GoalProgressListener } from './listeners/goal-progress.listener';

@Module({
  imports: [
    TypeOrmModule.forFeature([Goal, GoalContribution]),
    // EventEmitterModule must be registered at AppModule level:
    //   EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 })
    // The import here is only for documentation — remove if already in AppModule.
  ],
  controllers: [GoalsController],
  providers: [
    GoalsService,
    RoundUpService,
    GoalProgressListener,
  ],
  exports: [GoalsService, RoundUpService],
})
export class GoalsModule {}
