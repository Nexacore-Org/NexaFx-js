import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { MetricsService } from './metrics.service';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';
import { Public } from '../auth/decorators/public.decorator';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /** GET /metrics — restricted to internal network via IP allowlist */
  @Public()
  @UseGuards(IpAllowlistGuard)
  @Get()
  getMetrics(@Res() res: Response): void {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(this.metricsService.exposition());
  }
}
