import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { ReconciliationService } from '../services/reconciliation.service';
import { ReconciliationIssueQueryDto } from '../dto/reconciliation-issue-query.dto';

@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard, AdminGuard)
export class ReconciliationAdminController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('issues')
  getIssues(@Query() query: ReconciliationIssueQueryDto) {
    return this.reconciliationService.getIssues(query);
  }
}
