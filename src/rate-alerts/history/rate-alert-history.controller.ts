import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ListRateAlertsDto } from '../dto/list-rate-alerts.dto';
import { RateAlertHistoryService } from './rate-alert-history.service';

@Controller('rate-alerts/history')
@UseGuards(JwtAuthGuard)
export class RateAlertHistoryController {
  constructor(private readonly historyService: RateAlertHistoryService) {}

  @Get()
  findAll(@CurrentUser('sub') userId: string, @Query() dto: ListRateAlertsDto) {
    return this.historyService.findByUserId(
      userId,
      dto.page ?? 1,
      dto.limit ?? 20,
    );
  }
}
