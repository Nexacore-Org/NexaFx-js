import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../../auth/guards/admin.guard';

interface AmlAlertEntry {
  id: string;
  userId: string;
  type: string;
  severity: string;
  status: 'pending' | 'reviewed' | 'dismissed';
  createdAt: string;
}

/**
 * Admin endpoint exposing the AML alerts review queue.
 * Requires ADMIN role.
 */
@Controller('admin/aml-alerts')
@UseGuards(AdminGuard)
export class AmlAlertsController {
  @Get()
  getAmlAlerts(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ): { data: AmlAlertEntry[]; total: number; page: number; limit: number } {
    // Returns empty queue stub — wired to AML service in a full implementation
    return {
      data: [],
      total: 0,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
    };
  }
}
