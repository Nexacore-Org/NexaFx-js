import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { PdfService } from './pdf.service';
import { StatementQueryDto } from './dto/statement-query.dto';

@Controller()
export class DocumentsController {
  constructor(private readonly pdfService: PdfService) {}

  @Get('statements/:userId')
  async downloadStatement(
    @Param('userId') userId: string,
    @Query() query: StatementQueryDto,
    @Res() res: Response,
  ) {
    const pdf = await this.pdfService.generateStatementPdf(userId, query.from, query.to);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${userId}.pdf"`);
    Readable.from(pdf).pipe(res);
  }

  @Get('transactions/:id/receipt')
  async downloadReceipt(@Param('id') id: string, @Res() res: Response) {
    const pdf = await this.pdfService.generateReceiptPdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${id}.pdf"`);
    Readable.from(pdf).pipe(res);
  }
}
