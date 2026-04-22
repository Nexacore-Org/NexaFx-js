import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { IsArray, IsNotEmpty, IsString, ValidateNested, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { BulkTransactionService } from '../services/bulk-transaction.service';

class StatusUpdateItemDto {
  @IsNotEmpty() @IsString() transactionId: string;
  @IsNotEmpty() @IsString() status: string;
}

class BulkStatusUpdateDto {
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => StatusUpdateItemDto)
  updates: StatusUpdateItemDto[];
}

@Controller('admin/transactions')
@UseGuards(AdminGuard)
export class AdminBulkTransactionsController {
  constructor(private readonly bulkService: BulkTransactionService) {}

  /** POST /admin/transactions/bulk-status-update */
  @Post('bulk-status-update')
  async bulkStatusUpdate(@Req() req: any, @Body() dto: BulkStatusUpdateDto) {
    const adminUserId = req.user?.id ?? req.user?.sub;
    return this.bulkService.adminBulkStatusUpdate(dto.updates, adminUserId);
  }
}
