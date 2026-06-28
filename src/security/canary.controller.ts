import { Controller, Get, UseGuards } from '@nestjs/common';
import { CanaryService } from './canary.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CanaryController {
  constructor(private readonly canaryService: CanaryService) {}

  @Get('security/canary-tokens')
  @Roles('SUPER_ADMIN')
  async listTokens() {
    return this.canaryService.getAllTokens();
  }
}