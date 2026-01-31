import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateGoalDto } from './create-goal.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { GoalStatus } from '../entities/goal.entity';

export class UpdateGoalDto extends PartialType(CreateGoalDto) {
  @ApiPropertyOptional({ 
    description: 'Goal status', 
    enum: GoalStatus,
    example: GoalStatus.ACTIVE 
  })
  @IsEnum(GoalStatus)
  @IsOptional()
  status?: GoalStatus;
}