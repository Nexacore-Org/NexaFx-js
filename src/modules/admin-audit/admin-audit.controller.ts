import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuditService } from './admin-audit.service';
import { AdminAuditLogFilterDto } from './dto/admin-audit-log-filter.dto';
import { AdminGuard } from '../auth/guards/admin.guard';

@Controller('admin/audit-logs')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly adminAuditService: AdminAuditService) {}

  @Get()
  async getAuditLogs(@Query() filters: AdminAuditLogFilterDto) {
    return this.adminAuditService.findAll(filters);
  }
}
