import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { Request } from 'express';
import { AdminGuard } from '../../backup/guards/admin.guard';
import {
  SecurityEvent,
  SecurityEventsService,
} from '../services/security-events.service';
import { BruteForceService } from '../services/brute-force.service';
import { CaptchaService } from '../services/captcha.service';
import { RateLimitService } from '../services/rate-limit.service';

@Controller('security')
export class SecurityController {
  constructor(
    private readonly securityEventsService: SecurityEventsService,
    private readonly bruteForceService: BruteForceService,
    private readonly captchaService: CaptchaService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Get('suspicious-activities')
  @UseGuards(AdminGuard)
  async getSuspiciousActivities(
    @Query('limit') limit?: string,
    @Query('severity') severity?: SecurityEvent['severity'],
  ) {
    const events = await this.securityEventsService.getEvents(
      limit ? parseInt(limit, 10) : 100,
      0,
      severity ? { severity } : undefined,
    );

    return {
      success: true,
      count: events.length,
      data: events,
    };
  }

  @Get('admin/security-events')
  @UseGuards(AdminGuard)
  async getSecurityEvents(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('type') type?: string,
    @Query('severity') severity?: SecurityEvent['severity'],
  ) {
    const events = await this.securityEventsService.getEvents(
      limit ? parseInt(limit, 10) : 100,
      offset ? parseInt(offset, 10) : 0,
      {
        ...(type && { type }),
        ...(severity && { severity }),
      },
    );

    return {
      success: true,
      count: events.length,
      data: events,
    };
  }

  @Get('login-attempts/:userId')
  @UseGuards(AdminGuard)
  async getLoginAttempts(@Param('userId') userId: string) {
    const attempts = await this.bruteForceService.getLoginAttempts(userId);
    return {
      success: true,
      count: attempts.length,
      data: attempts,
    };
  }

  @Post('admin/reset-rate-limit/:userId')
  @UseGuards(AdminGuard)
  async resetRateLimit(@Param('userId') userId: string) {
    await this.rateLimitService.resetKey(userId);
    return {
      success: true,
      message: `Rate limit reset for user ${userId}`,
    };
  }

  @Post('captcha/verify')
  async verifyCaptcha(@Body('token') token: string, @Req() request: Request) {
    const ip = request.ip || '';
    const isValid = await this.captchaService.verifyCaptcha(token, ip);

    return {
      success: isValid,
      message: isValid ? 'Captcha verified' : 'Invalid captcha',
    };
  }
}
