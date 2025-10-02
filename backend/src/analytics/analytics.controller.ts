import { Controller, Get, Post, Param, Body, Res } from '@nestjs/common';
import { AnalyticsService } from './services/analytics.service';
import { ReportGenerationService } from './services/report-generation.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import { Response } from 'express';
import * as fs from 'fs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './entities/report.entity';


@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly reportGenerationService: ReportGenerationService,
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
  ) {}

  // --- USER ENDPOINTS ---
  @Get('user/:userId/summary')
  getUserSummary(@Param('userId') userId: string) {
    return this.analyticsService.getUserSummary(userId);
  }

  // --- ADMIN ENDPOINTS ---
  @Get('admin/platform-metrics')
  getPlatformMetrics() {
    return this.analyticsService.getPlatformMetrics();
  }
  
  // --- REPORTING ENDPOINTS ---
  @Post('reports/generate')
  generateReport(@Body() generateReportDto: GenerateReportDto) {
      return this.reportGenerationService.generateReport(
          generateReportDto.userId,
          generateReportDto.format,
      );
  }
  
  @Get('reports/:reportId')
  async downloadReport(@Param('reportId') reportId: string, @Res() res: Response) {
      const report = await this.reportRepository.findOne({ where: { id: reportId }});
      if (report && report.status === 'completed') {
          return res.download(report.fileUrl);
      }
      res.status(404).send('Report not found or not ready.');
  }
}