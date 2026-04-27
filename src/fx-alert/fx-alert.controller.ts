import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FxAlertService } from '../services/fx-alert.service';
import { CreateFxAlertDto } from '../dto/fx-alert.dto';

// ─── Lightweight stubs — replace with the project's actual guards/decorators ──
// These match the conventions used elsewhere in NexaFx-js
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('fx/alerts')
@UseGuards(JwtAuthGuard)
export class FxAlertController {
  constructor(private readonly fxAlertService: FxAlertService) {}

  /**
   * POST /fx/alerts
   * Create a new rate threshold alert for the authenticated user.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateFxAlertDto,
  ) {
    return this.fxAlertService.create(userId, dto);
  }

  /**
   * GET /fx/alerts
   * List all active alerts for the authenticated user.
   */
  @Get()
  async findAll(@CurrentUser('id') userId: string) {
    return this.fxAlertService.findAllForUser(userId);
  }

  /**
   * DELETE /fx/alerts/:id
   * Cancel an alert owned by the authenticated user.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) alertId: string,
  ) {
    return this.fxAlertService.delete(userId, alertId);
  }
}

@Controller('admin/fx/alerts')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FxAlertAdminController {
  constructor(private readonly fxAlertService: FxAlertService) {}

  /**
   * GET /admin/fx/alerts/analytics
   * Trigger rate, popular pairs, average time to trigger.
   */
  @Get('analytics')
  async getAnalytics() {
    return this.fxAlertService.getAnalytics();
  }
}
