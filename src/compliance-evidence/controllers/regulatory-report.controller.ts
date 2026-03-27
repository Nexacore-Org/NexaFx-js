import { Controller, Get, Patch, Param, Query, UseGuards, Body } from '@nestjs/common';
import { RegulatoryReportingService } from '../services/regulatory-reporting.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { ReportType, ReportStatus } from '../entities/regulatory-report.entity';

@Controller('admin/compliance/reports')
@UseGuards(RolesGuard)
export class RegulatoryReportController {
  constructor(private readonly reportingService: RegulatoryReportingService) {}

  @Get()
  @Roles('admin', 'compliance_officer')
  async listReports(
    @Query('type') type?: ReportType,
    @Query('status') status?: ReportStatus,
    @Query('start') start?: string,
    @Query('end') end?: string,
  ) {
    return this.reportingService.getReports({
      type,
      status,
      start: start ? new Date(start) : undefined,
      end: end ? new Date(end) : undefined,
    });
  }

  @Patch(':id/file')
  @Roles('admin', 'compliance_officer')
  async fileReport(@Param('id') id: string) {
    return this.reportingService.fileReport(id);
  }

  @Patch('settings/threshold')
  @Roles('admin')
  async updateThreshold(@Body('value') value: number) {
    return this.reportingService.setLtrThreshold(value);
  }
}