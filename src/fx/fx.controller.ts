import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FxService, ExecuteTradeDto } from './fx.service';

@Controller('api/v1/fx')
export class FxController {
  constructor(private readonly fxService: FxService) {}

  @Get('rates')
  getRates(
    @Query('base') base: string,
    @Query('target') target: string,
  ) {
    return this.fxService.getRates(base, target);
  }

  @Post('trades')
  @HttpCode(HttpStatus.CREATED)
  executeTrade(@Body() dto: ExecuteTradeDto) {
    return this.fxService.executeTrade(dto);
  }

  @Post('trades/:id/reverse')
  reverseTrade(@Param('id') id: string) {
    return this.fxService.reverseTrade(id);
  }
}
