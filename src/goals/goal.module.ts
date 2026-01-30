import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { Goal } from './entities/goal.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Goal])],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService], // Export service if other modules need to use it
})
export class GoalsModule {}