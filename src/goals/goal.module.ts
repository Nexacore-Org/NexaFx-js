import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoalsService } from './goal.service';
import { GoalsController } from './goals.controller';
import { Goal } from './entities/goal.entity';
import { GoalContribution } from './entities/goal-contribution.entity';
import { RoundUpService } from './services/round-up.service';
import { GoalProgressListener } from './listeners/goal-progress.listener';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, GoalContribution])],
  controllers: [GoalsController],
  providers: [GoalsService, RoundUpService, GoalProgressListener],
  exports: [GoalsService, RoundUpService],
})
export class GoalsModule {}
