import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { PdfService } from './pdf.service';
import { StatementQueryDto } from './dto/statement-query.dto';
import { StatementView } from '../statements/statements.types';

@Controller()
export class DocumentsController {
  constructor(private readonly pdfService: PdfService) {}

  @Get('statements/:userId')
  async downloadStatement(
    @Param('userId') userId: string,
    @Query() query: StatementQueryDto,
    @Res() res: Response,
  ) {
    const pdf = await this.pdfService.generateStatementPdf({
      user: {
        id: userId,
        email: `${userId}@example.com`,
        firstName: 'Account',
        lastName: 'Holder',
      },
      currency: 'EUR',
      period: {
        from:
          query.from ??
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: query.to ?? new Date().toISOString(),
      },
      openingBalance: 0,
      closingBalance: 0,
      lines: [],
      generatedAt: new Date().toISOString(),
    } satisfies StatementView);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="statement-${userId}.pdf"`,
    );
    Readable.from(pdf).pipe(res);
  }

  @Get('transactions/:id/receipt')
  async downloadReceipt(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.pdfService.generateReceiptPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${id}.pdf"`,
    );
    Readable.from(pdf).pipe(res);
  }
}
