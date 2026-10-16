import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

// Probes carry no JWT and must not be rate limited (issue #1402).
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  async check() {
    const result = await this.health.check();
    if (result.status !== 'healthy') {
      throw new ServiceUnavailableException(result);
    }
    return result;
  }
}
