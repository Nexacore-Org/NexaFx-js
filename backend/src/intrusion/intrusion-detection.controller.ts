import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { IntrusionDetectionService, DetectionResult } from './intrusion-detection.service';

@Controller('intrusion-detection')
@UseGuards(AuthGuard('jwt'))
export class IntrusionDetectionController {
  constructor(
    private readonly intrusionDetectionService: IntrusionDetectionService,
  ) {}

  @Post('analyze-login')
  async analyzeLoginAttempt(
    @Body() body: {
      userId: string;
      ipAddress: string;
      userAgent: string;
      success: boolean;
    },
  ): Promise<DetectionResult> {
    return this.intrusionDetectionService.analyzeLoginAttempt(
      body.userId,
      body.ipAddress,
      body.userAgent,
      body.success,
    );
  }

  @Get('suspicious-activities/ip')
  async getSuspiciousActivitiesByIp(@Query('ip') ipAddress: string) {
    return this.intrusionDetectionService.getSuspiciousActivitiesByIp(ipAddress);
  }

  @Get('suspicious-activities/user')
  async getSuspiciousActivitiesByUser(@Query('userId') userId: string) {
    return this.intrusionDetectionService.getSuspiciousActivitiesByUser(userId);
  }

  @Get('high-risk-activities')
  async getHighRiskActivities(@Query('minRiskScore') minRiskScore?: number) {
    return this.intrusionDetectionService.getHighRiskActivities(
      minRiskScore ? parseInt(minRiskScore.toString()) : 70,
    );
  }
}
