import { Controller, Get, Query, UseGuards, Req } from '@nestjs/common';
import { Request } from 'express';

interface RequestWithAnalysis extends Request {
  fingerprintAnalysis?: FingerprintAnalysisDto;
}

@Controller('api/fingerprint')
export class FingerprintAnalysisController {
  constructor(private fingerprintService: FingerprintAnalysisService) {}

  @Get('analyze')
  async analyzeCurrentRequest(@Req() req: RequestWithAnalysis) {
    // Analysis already done by middleware
    return req.fingerprintAnalysis || await this.fingerprintService.analyzeRequest(req);
  }

  @Get('suspicious')
  async getSuspiciousDevices(@Query('limit') limit = 50) {
    return await this.fingerprintService.getSuspiciousDevices(limit);
  }

  @Get('stats')
  async getStats() {
    return await this.fingerprintService.getDeviceStats();
  }
}
