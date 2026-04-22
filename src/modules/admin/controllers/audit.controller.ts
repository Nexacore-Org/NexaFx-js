import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { LedgerVerificationService } from '../services/ledger-verification.service';
import { AuditPackageService } from '../services/audit-package.service';

@ApiTags('Admin - Audit')
@ApiBearerAuth()
@Controller('admin/audit')
export class AuditController {
  constructor(
    private readonly ledgerVerification: LedgerVerificationService,
    private readonly auditPackageService: AuditPackageService,
  ) {}

  @Post('ledger-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run ledger verification — returns BALANCED or DISCREPANCY' })
  ledgerCheck() {
    return this.ledgerVerification.verifyLedger();
  }

  @Post('package')
  @ApiOperation({ summary: 'Trigger async audit package generation (ZIP with SHA-256 manifest)' })
  generatePackage(@Body('triggeredBy') triggeredBy: string) {
    return this.auditPackageService.generatePackage(triggeredBy ?? 'manual');
  }

  @Get('packages')
  @ApiOperation({ summary: 'List generated audit packages with download links' })
  listPackages() {
    return this.auditPackageService.listPackages();
  }
}
