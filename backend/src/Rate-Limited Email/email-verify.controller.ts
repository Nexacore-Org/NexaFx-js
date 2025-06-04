import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { EmailVerifyService } from './email-verify.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('auth/email')
@UseGuards(ThrottlerGuard)
export class EmailVerifyController {
  constructor(private readonly emailVerifyService: EmailVerifyService) {}

  @Post('resend')
  @Throttle(3, 3600) // 3 requests per hour
  @ApiOperation({ summary: 'Resend email verification' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email', example: 'user@example.com' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async resendVerification(@Body('email') email: string) {
    await this.emailVerifyService.resendVerificationEmail(email);
    return { message: 'Verification email resent if account exists' };
  }
}