import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { FeeEngineService } from '../services/fee-engine.service';
import { SimulateFeeDto } from '../dto/simulate-fee.dto';

@Controller('fees')
@UseGuards(JwtAuthGuard)
export class FeeSimulationController {
  constructor(private readonly feeEngineService: FeeEngineService) {}

  @Post('simulate')
  simulate(@Body() dto: SimulateFeeDto) {
    return this.feeEngineService.simulate(dto);
  }
}
