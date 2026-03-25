import { Controller, Post, Body, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SimulationService } from './simulation.service';
import { SandboxInterceptor } from './sandbox.interceptor';

@Controller('simulation')
@UseGuards(JwtAuthGuard)
@UseInterceptors(SandboxInterceptor)
export class SimulationController {
  constructor(private readonly simulationService: SimulationService) {}

  @Post('run')
  run(@Body() body: any) {
    return this.simulationService.runSimulation(body);
  }
}
