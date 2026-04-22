import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';
import { BulkTransactionService } from '../services/bulk-transaction.service';
import { BulkBatchMode } from '../entities/bulk-batch.entity';
import { CreateTransactionDto } from '../dto/create-transaction.dto';

class BulkCreateDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateTransactionDto)
  items: CreateTransactionDto[];

  @IsEnum(BulkBatchMode)
  @IsOptional()
  mode?: BulkBatchMode = BulkBatchMode.BEST_EFFORT;
}

class BulkExportDto {
  @IsOptional() status?: string;
  @IsOptional() from?: string;
  @IsOptional() to?: string;
}

@Controller('transactions')
@UseGuards(JwtAuthGuard)
export class BulkTransactionsController {
  constructor(private readonly bulkService: BulkTransactionService) {}

  /** POST /transactions/bulk */
  @Post('bulk')
  @HttpCode(HttpStatus.CREATED)
  async createBulk(@Req() req: any, @Body() dto: BulkCreateDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.bulkService.createBulk(
      userId,
      dto.items,
      dto.mode ?? BulkBatchMode.BEST_EFFORT,
    );
  }

  /** GET /transactions/bulk/:batchId */
  @Get('bulk/:batchId')
  getBatch(@Param('batchId') batchId: string) {
    return this.bulkService.getBatch(batchId);
  }

  /** POST /transactions/bulk-export */
  @Post('bulk-export')
  @HttpCode(HttpStatus.ACCEPTED)
  async queueExport(@Req() req: any, @Body() dto: BulkExportDto) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.bulkService.queueExport(userId, dto);
  }

  /** GET /jobs/:id/status */
  @Get('/jobs/:id/status')
  getJobStatus(@Param('id') id: string) {
    return this.bulkService.getJobStatus(id);
  }
}
