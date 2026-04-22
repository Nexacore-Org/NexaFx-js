import { Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { SplitPaymentService } from '../services/split-payment.service';
import { SplitStatus } from '../entities/split-payment.entity';

@ApiTags('Split Payments Admin')
@ApiBearerAuth('access-token')
@Controller('admin/split-payments')
@UseGuards(JwtAuthGuard)
export class SplitPaymentAdminController {
  constructor(private readonly splitPaymentService: SplitPaymentService) {}

  @Get()
  @ApiOperation({ summary: 'List all splits with optional status filter' })
  @ApiQuery({ name: 'status', enum: SplitStatus, required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('status') status?: SplitStatus,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.splitPaymentService.adminList(status, parseInt(page, 10) || 1, parseInt(limit, 10) || 20);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Admin cancel a split and trigger refunds for paid participants' })
  @ApiParam({ name: 'id', description: 'Split payment UUID' })
  async cancel(@Param('id') id: string) {
    const split = await this.splitPaymentService.adminCancel(id);
    return { success: true, data: split };
  }
}
