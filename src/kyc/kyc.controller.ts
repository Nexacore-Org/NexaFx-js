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
import { KycService } from './kyc.service';
import { SubmitKycRequestDto } from './dto/submit-kyc.dto';
import { ReviewKycRequestDto } from './dto/review-kyc.dto';
import { AppealKycRequestDto } from './dto/appeal-kyc.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../common/guards/ip-allowlist.guard';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('submit')
  @HttpCode(HttpStatus.CREATED)
  submit(
    @Req() req: AuthenticatedRequest,
    @Body() dto: SubmitKycRequestDto,
  ) {
    // A submission always belongs to the caller; a body-supplied userId is ignored.
    return this.kycService.submit({ ...dto, userId: req.user?.sub ?? '' });
  }

  @Post(':id/appeal')
  appeal(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AppealKycRequestDto,
  ) {
    return this.kycService.appeal(id, dto.reason, req.user?.sub ?? '');
  }

  @UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
  @Patch(':id/review')
  review(
    @Param('id') id: string,
    @Body() dto: ReviewKycRequestDto,
    @CurrentUser('id') reviewerId: string,
  ) {
    // The reviewer is the authenticated admin; a body-supplied identity is not accepted.
    return this.kycService.review(id, { ...dto, reviewerId });
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
