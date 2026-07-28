import { Controller, Get, Query } from '@nestjs/common';
import { FeesService } from './fees.service';

@Controller('api/v1/fees')
export class FeesController {
  constructor(private readonly feesService: FeesService) {}

  @Get('preview')
  previewFee(
    @Query('type') type: string,
    @Query('amount') amount: string,
    @Query('currency') currency?: string,
  ) {
    return this.feesService.previewFee(
      type || 'deposit',
      parseFloat(amount || '0'),
      currency,
    );
  }
}
