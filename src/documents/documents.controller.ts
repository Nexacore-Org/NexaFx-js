import {
  Controller,
  Get,
  Param,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Readable } from 'stream';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatementQueryDto } from './dto/statement-query.dto';
import { StatementView } from '../statements/statements.types';

interface AuthenticatedRequest {
  user?: {
    sub?: string;
  };
}

@Controller()
export class DocumentsController {
  constructor(private readonly pdfService: PdfService) {}

  @UseGuards(JwtAuthGuard)
  @Get('statements/:userId')
  async downloadStatement(
    @Param('userId') userId: string,
    @Query() query: StatementQueryDto,
    @Req() request: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    if (request.user?.sub !== userId) {
      throw new UnauthorizedException(
        'You can only download your own statements',
      );
    }
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
