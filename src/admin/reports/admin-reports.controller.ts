import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { AdminRoleGuard } from '../../common/guards/admin-role.guard';
import { IpAllowlistGuard } from '../../common/guards/ip-allowlist.guard';
import { ReportsService } from './reports.service';

const MAX_RANGE_MS = 366 * 86_400_000;

/** Admin report routes (issue #1396). Dates must be ISO, from <= to, and at most one year apart. */
@Controller('admin/reports')
@UseGuards(JwtAuthGuard, AdminRoleGuard, IpAllowlistGuard)
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}

  private range(from: string, to: string): [Date, Date] {
    const [f, t] = [new Date(from), new Date(to)];
    if (isNaN(+f) || isNaN(+t) || f > t || +t - +f > MAX_RANGE_MS) {
      throw new BadRequestException('from/to must be ISO dates, from <= to, within one year');
    }
    return [f, t];
  }

  @Get('revenue')
  revenue(@Query('from') from: string, @Query('to') to: string, @Query('currency') currency = 'USD') {
    return this.reports.revenueReport(...this.range(from, to), currency);
  }

  @Get('user-growth')
  userGrowth(@Query('from') from: string, @Query('to') to: string) {
    return this.reports.userGrowth(...this.range(from, to));
  }
}
