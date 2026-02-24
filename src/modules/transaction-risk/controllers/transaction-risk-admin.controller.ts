import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { TransactionRiskScoringService } from '../services/transaction-risk-scoring.service';
import { OverrideRiskScoreDto } from '../dto/override-risk-score.dto';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { AuditLog } from '../../admin-audit/decorators/audit-log.decorator';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';

@Controller('admin/transaction-risk')
@UseGuards(AdminGuard)
export class TransactionRiskAdminController {
  constructor(private readonly riskService: TransactionRiskScoringService) {}

  @Get('flagged')
  @SkipAudit()
  getFlagged(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.riskService.getFlaggedTransactions(Number(page), Number(limit));
  }

  @Get('summary')
  @SkipAudit()
  getSummary() {
    return this.riskService.getRiskSummary();
  }

  @Get(':transactionId')
  @SkipAudit()
  getByTransaction(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
  ) {
    return this.riskService.getByTransactionId(transactionId);
  }

  @Patch(':transactionId/override')
  @AuditLog({
    action: 'OVERRIDE_TRANSACTION_RISK',
    entity: 'TransactionRiskScore',
    entityIdParam: 'transactionId',
    description: 'Admin overrode a transaction risk score',
  })
  override(
    @Param('transactionId', new ParseUUIDPipe()) transactionId: string,
    @Body() dto: OverrideRiskScoreDto,
    @Request() req: any,
  ) {
    const adminId = req.user?.id ?? 'system';
    return this.riskService.adminOverride(transactionId, dto, adminId);
  }
}
