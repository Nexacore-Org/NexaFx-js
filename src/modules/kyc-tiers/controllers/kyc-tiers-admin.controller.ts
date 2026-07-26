import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { KycTiersService } from '../services/kyc-tiers.service';
import { ListKycTierUpgradesDto } from '../dto/list-kyc-tier-upgrades.dto';
import { ReviewKycTierUpgradeDto } from '../dto/review-kyc-tier-upgrade.dto';

@ApiTags('Admin KYC Tiers')
@ApiBearerAuth('access-token')
@Controller('admin/kyc-tiers')
@UseGuards(JwtAuthGuard, AdminGuard)
export class KycTiersAdminController {
  constructor(private readonly kycTiersService: KycTiersService) {}

  @Get()
  @ApiOperation({ summary: 'List all KYC tier upgrade requests' })
  @ApiOkResponse({ description: 'Paginated list of upgrade requests' })
  async list(@Query(ValidationPipe) dto: ListKycTierUpgradesDto) {
    return this.kycTiersService.listUpgrades(dto);
  }

  @Patch(':id/approve')
  @ApiOperation({ summary: 'Approve a KYC tier upgrade request' })
  @ApiParam({ name: 'id', description: 'Upgrade request UUID' })
  @ApiOkResponse({ description: 'Upgrade approved' })
  async approve(@Param('id') id: string, @Query('adminId') adminId: string) {
    return this.kycTiersService.approve(id, adminId);
  }

  @Patch(':id/reject')
  @ApiOperation({ summary: 'Reject a KYC tier upgrade request' })
  @ApiParam({ name: 'id', description: 'Upgrade request UUID' })
  @ApiOkResponse({ description: 'Upgrade rejected' })
  async reject(
    @Param('id') id: string,
    @Query('adminId') adminId: string,
    @Body(ValidationPipe) dto: ReviewKycTierUpgradeDto,
  ) {
    return this.kycTiersService.reject(id, adminId, dto.reason);
  }
}
