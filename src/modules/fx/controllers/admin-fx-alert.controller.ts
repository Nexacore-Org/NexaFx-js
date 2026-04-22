import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { FxAlertService } from '../services/fx-alert.service';

@ApiTags('Admin - FX Analytics')
@ApiBearerAuth()
@Controller('admin/fx/alerts')
export class AdminFxAlertController {
  constructor(private readonly fxAlertService: FxAlertService) {}

  @Get('analytics')
  @ApiOperation({ summary: 'FX alert analytics: popular pairs, trigger frequency, avg time to trigger' })
  getAnalytics() {
    return this.fxAlertService.getAnalytics();
  }
}
