import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  Req,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { KycService, SubmitKycDto, ReviewKycDto } from './kyc.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Req() req: AuthenticatedRequest,
    @Body() dto: Omit<SubmitKycDto, 'userId'>,
  ) {
    // A submission always belongs to the caller; a body-supplied userId is ignored.
    return this.kycService.submit({ ...dto, userId: req.user?.sub ?? '' });
  }

  @Post(':id/appeal')
  appeal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    return this.kycService.appeal(id, reason, req.user?.sub ?? '');
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch(':id/review')
  review(@Param('id') id: string, @Body() dto: ReviewKycDto) {
    return this.kycService.review(id, dto);
  }

  @Get(':userId/expiry-status')
  checkExpiry(
    @Req() req: AuthenticatedRequest,
    @Param('userId') userId: string,
  ) {
    if (req.user?.sub !== userId) {
      throw new ForbiddenException(
        'You can only check your own KYC expiry status',
      );
    }
    return this.kycService.checkExpiry(userId);
  }
}
