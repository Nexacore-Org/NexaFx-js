import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { FeatureFlagsService } from './feature-flags.service';

@ApiTags('feature-flags')
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  /** Read-only, public: clients use it to hide disabled features. Reveals no secrets. */
  @Public()
  @Get()
  @ApiOperation({ summary: 'Which feature flags are enabled in this environment' })
  getAll() {
    return this.flags.getAll();
  }
}
