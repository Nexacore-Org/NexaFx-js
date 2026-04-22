import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { BankReconciliationService } from '../services/bank-reconciliation.service';

@Controller('admin/banking')
export class AdminBankingController {
  constructor(private readonly reconciliationService: BankReconciliationService) {}

  /** GET /admin/banking/unreconciled */
  @Get('unreconciled')
  getUnreconciled() {
    return this.reconciliationService.getUnreconciled();
  }

  /** POST /admin/banking/force-settle/:id */
  @Post('force-settle/:id')
  forceSettle(@Param('id') id: string, @Req() req: any) {
    const adminUserId = req.user?.id ?? req.user?.sub ?? 'admin';
    return this.reconciliationService.forceSettle(id, adminUserId);
  }
}
