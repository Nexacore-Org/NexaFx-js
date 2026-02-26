import { Controller, Post, Body, Param, Get } from '@nestjs/common';
import { StrategyManagerService } from '../services/strategy-manager.service';
import { OptimizationService } from '../services/optimization.service';
import { Strategy } from '../entities/strategy.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

@Controller('admin/strategies')
export class StrategyAdminController {
  constructor(
    private readonly strategyManager: StrategyManagerService,
    private readonly optimizationService: OptimizationService,
    @InjectRepository(Strategy)
    private readonly strategyRepo: Repository<Strategy>,
  ) {}

  @Post(':id/optimize')
  async triggerOptimization(
    @Param('id') id: string,
    @Body() body: { data: any[] },
  ) {
    await this.strategyManager.evaluateAndAdapt(id, body.data);
    return { message: 'Optimization triggered successfully' };
  }

  @Get(':id')
  async getStrategy(@Param('id') id: string) {
    return this.strategyRepo.findOne({
      where: { id },
      relations: ['parameters', 'versions', 'metrics'],
    });
  }

  @Post()
  async createStrategy(@Body() strategyData: Partial<Strategy>) {
    const strategy = this.strategyRepo.create(strategyData);
    return this.strategyRepo.save(strategy);
  }

  @Post('seed/default')
  async seedStrategy() {
    const strategy = this.strategyRepo.create({
      name: 'MovingAverageCrossover',
      description: 'Simple MA crossover strategy',
      isActive: true,
      parameters: [
        {
          key: 'shortPeriod',
          value: 10,
          min: 5,
          max: 20,
          step: 1,
          description: 'Short moving average period',
        },
        {
          key: 'longPeriod',
          value: 50,
          min: 20,
          max: 100,
          step: 5,
          description: 'Long moving average period',
        },
      ],
    });
    return this.strategyRepo.save(strategy);
  }
}
