import {
  Controller,
  Get,
  Query,
  Req,
  UseGuards,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatementsService } from './statements.service';

type RequestWithUser = {
  user?: {
    sub?: string;
    id?: string;
  };
};

@Controller('api/v1/statements')
export class StatementsController {
  constructor(private readonly statementsService: StatementsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getStatement(
    @Req() request: RequestWithUser,
    @Query('currency') currency: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('format') format?: 'json' | 'pdf',
    @Res({ passthrough: true }) response?: Response,
  ) {
    const userId = request.user?.sub ?? request.user?.id ?? '';
    const result = await this.statementsService.generateStatement({
      userId,
      currency,
      from,
      to,
      format,
    });

    if (result instanceof Uint8Array) {
      response?.setHeader('Content-Type', 'application/pdf');
      response?.setHeader(
        'Content-Disposition',
        'attachment; filename="statement.pdf"',
      );
      return new StreamableFile(result);
    }

    return result;
  }
}
