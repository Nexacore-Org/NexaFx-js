import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { CircuitBreakerService } from '../../common/circuit-breaker/circuit-breaker.service';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('admin/circuit-breakers')
@UseGuards(AdminGuard)
export class CircuitBreakerController {
  constructor(private readonly breaker: CircuitBreakerService) {}

  @Get()
  async getAll() {
    return this.breaker.getAll();
  }

  @Post(':name/open')
  async open(@Param('name') name: string) {
    await this.breaker.manualOpen(name);
    return { message: `Circuit '${name}' manually opened` };
  }
}
