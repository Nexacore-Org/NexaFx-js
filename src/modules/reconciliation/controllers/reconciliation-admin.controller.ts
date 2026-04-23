import { Controller, Get, Query, UseGuards, Patch, Param, Body, Req } from '@nestjs/common';
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

  @Patch('issues/:id/resolve')
  resolveIssue(
    @Param('id') id: string,
    @Body('resolution') resolution: string,
    @Req() req: any,
  ) {
    const adminId = req.user.id;
    return this.reconciliationService.resolveIssue(id, resolution, adminId, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }
}
