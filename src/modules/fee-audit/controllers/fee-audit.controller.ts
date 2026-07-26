import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { FeeAuditService } from '../services/fee-audit.service';
import { ListFeeAuditDto } from '../dto/fee-audit.dto';

@Controller('admin/fee-audit')
@UseGuards(JwtAuthGuard, AdminGuard)
export class FeeAuditController {
  constructor(private readonly service: FeeAuditService) {}

  @Get()
  list(@Query() query: ListFeeAuditDto) {
    return this.service.queryAuditTrail({
      userId: query.userId,
      transactionId: query.transactionId,
      feeType: query.feeType,
      page: query.page,
      limit: query.limit,
    });
  }
}
