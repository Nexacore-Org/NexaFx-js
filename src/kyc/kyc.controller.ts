import {
  Controller,
  Post,
  Patch,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { KycService, SubmitKycDto, ReviewKycDto } from './kyc.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';

@Controller('api/v1/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(@Body() dto: SubmitKycDto) {
    return this.kycService.submit(dto);
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewKycDto) {
    return this.kycService.review(id, dto);
  }
}
