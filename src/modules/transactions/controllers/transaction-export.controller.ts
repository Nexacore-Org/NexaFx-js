import { Controller, Get, Query, Res, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('api/v1/transactions')
@UseGuards(JwtAuthGuard)
export class TransactionExportController {
  private readonly exportRateLimitMap = new Map<string, Date>();

  @Get('export')
  async exportTransactions(
    @Query('format') format: string = 'csv',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: { user: { sub: string } },
    @Res() res?: Response,
  ) {
    const userId = req?.user?.sub ?? 'unknown';

    // Rate limit: 1 export per hour per user
    const lastExport = this.exportRateLimitMap.get(userId);
    if (lastExport && Date.now() - lastExport.getTime() < 3_600_000) {
      res?.status(429).json({ message: 'Export rate limit: 1 request per hour' });
      return;
    }
    this.exportRateLimitMap.set(userId, new Date());

    // Build CSV header and stub rows
    const csvHeader = 'id,type,amount,currency,status,createdAt\n';
    const fromNote = from ? `from=${from}` : '';
    const toNote = to ? `to=${to}` : '';
    const csvContent = `${csvHeader}# Filtered: userId=${userId} ${fromNote} ${toNote}\n`;

    const filename = `transactions_${Date.now()}.csv`;

    res?.setHeader('Content-Type', 'text/csv');
    res?.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res?.send(Buffer.from(csvContent, 'utf-8'));
  }
}
