import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ReferralService } from './referral.service';

export interface ApplyCodeDto {
  code: string;
  refereeId: string;
}

@Controller('api/v1/referrals')
export class ReferralController {
  constructor(private readonly referralService: ReferralService) {}

  @Post('apply')
  @HttpCode(HttpStatus.CREATED)
  apply(@Body() dto: ApplyCodeDto) {
    return this.referralService.applyCode(dto.code, dto.refereeId);
  }
}
