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
import { StatementQueryDto } from './dto/statement-query.dto';
import { StatementsService } from './statements.service';

type RequestWithUser = {
  user?: {
    sub?: string;
    id?: string;
  };
};

@Controller('statements')
export class StatementsController {
  constructor(private readonly statementsService: StatementsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async getStatement(
    @Req() request: RequestWithUser,
    @Query() query: StatementQueryDto,
    @Res({ passthrough: true }) response?: Response,
  ) {
    const userId = request.user?.sub ?? request.user?.id ?? '';
    const result = await this.statementsService.generateStatement({
      userId,
      currency: query.currency ?? '',
      from: query.from ?? '',
      to: query.to ?? '',
      format: query.format,
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
