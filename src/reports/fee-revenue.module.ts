import { Module } from '@nestjs/common';
import { FeeRevenueController } from './fee-revenue.controller';

@Module({
  controllers: [FeeRevenueController],
})
export class FeeRevenueModule {}