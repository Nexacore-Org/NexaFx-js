import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ConversionsService } from './conversions.service';
import { ExecuteDto, QuoteDto } from './dto/conversion.dto';

@Controller('conversions')
export class ConversionsController {
  constructor(private readonly service: ConversionsService) {}

  @Post('quote')
  quote(@Body() dto: QuoteDto) {
    return this.service.quote(dto);
  }

  @Post('execute')
  execute(@Body() dto: ExecuteDto) {
    return this.service.execute(dto);
  }

  @Get(':conversionId')
  get(@Param('conversionId') id: string) {
    return this.service.get(id);
  }

  @Get('user/:userId/history')
  history(@Param('userId') userId: string) {
    return this.service.history(userId);
  }

  @Post('admin/reverse/:conversionId')
  reverse(@Param('conversionId') id: string) {
    return this.service.reverse(id);
  }

  @Get('limits/:userId')
  limits(@Param('userId') userId: string) {
    return this.service.getLimits(userId);
  }
}


