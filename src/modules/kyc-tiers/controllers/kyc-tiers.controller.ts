import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { KycTiersService } from '../services/kyc-tiers.service';
import { RequestKycTierUpgradeDto } from '../dto/request-kyc-tier-upgrade.dto';
import { ListOwnKycTierUpgradesDto } from '../dto/list-own-kyc-tier-upgrades.dto';

@ApiTags('KYC Tier Upgrade')
@ApiBearerAuth('access-token')
@Controller('kyc-tiers')
@UseGuards(JwtAuthGuard)
export class KycTiersController {
  constructor(private readonly kycTiersService: KycTiersService) {}

  @Post('upgrade')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Request a KYC tier upgrade' })
  @ApiCreatedResponse({ description: 'Tier upgrade request submitted' })
  async requestUpgrade(
    @Request() req: any,
    @Body(ValidationPipe) dto: RequestKycTierUpgradeDto,
  ) {
    const userId = req.user?.id;
    return this.kycTiersService.requestUpgrade(userId, dto);
  }

  @Get('upgrade/history')
  @ApiOperation({ summary: 'Your own tier upgrade requests, newest first' })
  @ApiOkResponse({ description: 'Paginated history' })
  async getHistory(@Request() req: any, @Query() query: ListOwnKycTierUpgradesDto) {
    return this.kycTiersService.listOwnUpgrades(req.user?.id, query.page, query.limit);
  }

  @Get('upgrade/status')
  @ApiOperation({ summary: 'Get current KYC tier upgrade status' })
  @ApiOkResponse({ description: 'Current upgrade status' })
  async getStatus(@Request() req: any) {
    const userId = req.user?.id;
    return this.kycTiersService.getStatus(userId);
  }
}
