import { Controller, Get } from '@nestjs/common';
import { SecurityHealthService } from './security-health.service';

@Controller('security')
export class SecurityHealthController {
  constructor(private readonly healthService: SecurityHealthService) {}

  @Get('health')
  getHealth() {
    return this.healthService.getSecurityHealth();
  }
}
