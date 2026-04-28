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
import { GoalTransactionIntegrationService } from './goat-transaction-integration.service';
import { WalletsModule } from '../modules/wallets/wallets.module';

@Module({
  imports: [TypeOrmModule.forFeature([Goal, GoalContribution]), ScheduleModule, WalletsModule],
  controllers: [GoalsController],
  providers: [GoalsService, RoundUpService, GoalProgressListener, GoalExpiryJob, GoalTransactionIntegrationService],
  exports: [GoalsService, RoundUpService, GoalTransactionIntegrationService],
})
export class GoalsModule {}
