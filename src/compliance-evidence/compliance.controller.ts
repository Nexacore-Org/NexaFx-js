import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  Res,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { ComplianceService } from './compliance.service';
import { GenerateReportDto, ReportFilterDto } from './dto/generate-report.dto';
import { ComplianceGuard } from './guards/compliance.guard';

// Assumes a standard JwtAuthGuard exists in the project
// import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Admin Compliance')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard, ComplianceGuard)  // uncomment when guards are wired
@UseGuards(ComplianceGuard)
@Controller('admin/compliance')
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Post('report')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue a compliance report for async generation' })
  @ApiResponse({ status: 202, description: 'Report queued successfully' })
  async requestReport(@Body() dto: GenerateReportDto, @Req() req: any) {
    const requestedBy: string = req.user?.id ?? req.user?.sub ?? 'system';
    return this.complianceService.requestReport(dto, requestedBy);
  }

  @Get('report')
  @ApiOperation({ summary: 'List compliance reports' })
  async listReports(@Query() filters: ReportFilterDto) {
    return this.complianceService.listReports(filters);
  }

  @Get('report/:id')
  @ApiOperation({ summary: 'Get a specific compliance report' })
  async getReport(@Param('id', ParseUUIDPipe) id: string) {
    return this.complianceService.findReport(id);
  }

  @Get('report/:id/export')
  @ApiOperation({ summary: 'Download a completed compliance report (CSV or JSON)' })
  async exportReport(
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const { content, mimeType, filename } = await this.complianceService.exportReport(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(content);
  }

  @Get('report/:id/verify')
  @ApiOperation({ summary: 'Verify tamper-proof checksum of a completed report' })
  async verifyChecksum(@Param('id', ParseUUIDPipe) id: string) {
    return this.complianceService.verifyChecksum(id);
  }

  @Post('audit-snapshot')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an immutable audit evidence log snapshot' })
  async snapshotAudit(@Query() filters: ReportFilterDto, @Req() req: any) {
    const actorId: string = req.user?.id ?? req.user?.sub ?? 'system';
    const actorRole: string = req.user?.role ?? req.user?.roles?.[0] ?? 'compliance_officer';
    return this.complianceService.snapshotAuditEvidence(actorId, actorRole, {
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
    });
  }
}
