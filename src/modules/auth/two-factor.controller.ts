import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { OtpService } from '../../otp/otp.service';
import { OtpPurpose } from '../../otp/otp.entity';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequireFeature } from '../feature-flags/require-feature.decorator';
import { FeatureFlag } from '../feature-flags/feature-flags.catalog';

/** 2FA setup/verification disappears (404) whenever FEATURE_TWO_FA is off. */
@Controller('auth/2fa')
@UseGuards(JwtAuthGuard)
@RequireFeature(FeatureFlag.TWO_FA)
export class TwoFactorController {
  constructor(private readonly otp: OtpService) {}

  @Post('setup')
  async setup(
    @CurrentUser('sub') userId: string,
    @Body() body: { email: string },
  ) {
    await this.otp.generate(userId, OtpPurpose.TWO_FA, body.email);
    return { message: 'Two-factor verification code sent' };
  }

  @Post('verify')
  async verify(
    @CurrentUser('sub') userId: string,
    @Body() body: { code: string },
  ) {
    return { valid: await this.otp.verify(userId, body.code, OtpPurpose.TWO_FA) };
  }
}
