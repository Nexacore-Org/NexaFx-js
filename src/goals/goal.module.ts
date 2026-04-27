import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { GoalsService } from './goal.service';
import { GoalsController } from './goals.controller';
import { Goal } from './entities/goal.entity';
import { GoalContribution } from './entities/goal-contribution.entity';
import { RoundUpService } from './services/round-up.service';
import { GoalProgressListener } from './listeners/goal-progress.listener';
import { GoalExpiryJob } from './jobs/goal-expiry.job';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, GoalContribution]), ScheduleModule.forRoot()],
  controllers: [GoalsController],
  providers: [GoalsService, RoundUpService, GoalProgressListener, GoalExpiryJob],
  exports: [GoalsService, RoundUpService],
})
export class GoalsModule {}
