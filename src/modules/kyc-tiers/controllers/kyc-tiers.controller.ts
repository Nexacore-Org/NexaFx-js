import {
  Body,
  Controller,
  Get,
  Post,
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
    const userId = req.user?.id ?? req.user?.sub;
    return this.kycTiersService.requestUpgrade(userId, dto);
  }

  @Get('upgrade/status')
  @ApiOperation({ summary: 'Get current KYC tier upgrade status' })
  @ApiOkResponse({ description: 'Current upgrade status' })
  async getStatus(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.kycTiersService.getStatus(userId);
  }
}
