import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { IsOptional, IsString } from 'class-validator';
import { KycService } from '../services/kyc.service';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { CountryRuleEntity } from '../entities/country-rule.entity';

class UpdateKycStatusDto {
  @IsString()
  action: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  reason?: string;
}

@Controller('admin/kyc')
@UseGuards(JwtAuthGuard, AdminGuard)
export class KycAdminController {
  constructor(private readonly kycService: KycService) {}

  @Patch(':userId/status/:docId')
  async updateStatus(
    @Param('userId') userId: string,
    @Param('docId') docId: string,
    @Body(ValidationPipe) dto: UpdateKycStatusDto,
  ) {
    if (dto.action === 'approve') {
      return this.kycService.approve(userId, docId);
    }
    return this.kycService.reject(userId, docId, dto.reason ?? 'No reason provided');
  }

  @Post('country-rules')
  upsertCountryRule(@Body() data: Partial<CountryRuleEntity>) {
    return this.kycService.upsertCountryRule(data);
  }
}
