import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Res,
  Header,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { ExportService } from '../services/export.service';
import { ExportTransactionsDto, ExportBalancesDto } from '../dto/export.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt.guard';

@ApiTags('Export')
@ApiBearerAuth('access-token')
@Controller('api/v1/export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Get('transactions')
  @ApiOperation({ summary: 'Export transactions as CSV or JSON' })
  async exportTransactions(
    @Query() dto: ExportTransactionsDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const result = await this.exportService.exportTransactions(userId, dto);

    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
      return res.send(result);
    }

    return res.json(result);
  }

  @Get('balances')
  @ApiOperation({ summary: 'Export wallet balances as CSV or JSON' })
  async exportBalances(
    @Query() dto: ExportBalancesDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const result = await this.exportService.exportBalances(userId, dto);

    if (dto.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="balances.csv"');
      return res.send(result);
    }

    return res.json(result);
  }
}
