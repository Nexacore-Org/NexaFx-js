import { Controller, Get, Query, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';
import { FxAggregatorService } from './fx-aggregator.service';

@Controller('fx')
export class FxController {
  constructor(private readonly fxAggregatorService: FxAggregatorService) {}

  @Get('rates')
  async getRates(
    @Query('base') base: string = 'USD',
    @Res() res: Response,
  ) {
    const result = await this.fxAggregatorService.getRates(base);

    if (result.success) {
      return res.status(HttpStatus.OK).json(result);
    }

    // Partial success — return 206 with last-known data if available
    if (result.lastKnown) {
      return res.status(HttpStatus.PARTIAL_CONTENT).json(result);
    }

    return res.status(HttpStatus.SERVICE_UNAVAILABLE).json(result);
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'FxAggregator' };
  }
}
