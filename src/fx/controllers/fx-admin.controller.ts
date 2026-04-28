import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../modules/auth/guards/roles.guard';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { FxConversionService } from '../services/fx-conversion.service';
import { RateProviderService } from '../services/rate-provider.service';

@ApiTags('Admin FX')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/fx')
export class FxAdminController {
  constructor(
    private readonly fxService: FxConversionService,
    private readonly rateProvider: RateProviderService,
  ) {}

  @Get('reversals')
  @ApiOperation({ summary: 'List all reversed FX conversions' })
  @ApiOkResponse({ description: 'List of reversed conversions' })
  async getReversals(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.fxService.getAllReversals({ startDate, endDate });
  }

  @Get('providers')
  @ApiOperation({ summary: 'Get status and metrics for all FX rate providers' })
  @ApiOkResponse({ description: 'Provider status list' })
  async getProviders() {
    return this.rateProvider.getProviderStatus();
  }
}
