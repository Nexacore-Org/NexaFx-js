import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateRateAlertDto } from './dto/create-rate-alert.dto';
import { ListRateAlertsDto } from './dto/list-rate-alerts.dto';
import { RateAlertsService } from './rate-alerts.service';

@Controller('rate-alerts')
@UseGuards(JwtAuthGuard)
export class RateAlertsController {
  constructor(private readonly rateAlertsService: RateAlertsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser('sub') userId: string, @Body() dto: CreateRateAlertDto) {
    return this.rateAlertsService.create(userId, dto);
  }

  @Get()
  findAll(@CurrentUser('sub') userId: string, @Query() dto: ListRateAlertsDto) {
    return this.rateAlertsService.findByUser(
      userId,
      dto.page ?? 1,
      dto.limit ?? 20,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deactivate(
    @CurrentUser('sub') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.rateAlertsService.deactivate(id, userId);
  }
}
