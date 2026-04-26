import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ConversionRuleService } from '../services/conversion-rule.service';

@Controller('fx/rules')
export class ConversionRuleController {
  constructor(
    private readonly conversionRuleService: ConversionRuleService,
  ) {}

  @Post()
  create(@Req() req, @Body() body) {
    return this.conversionRuleService.create(req.user.id, body);
  }

  @Get()
  findAll(@Req() req) {
    return this.conversionRuleService.findAll(req.user.id);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() body) {
    return this.conversionRuleService.update(id, req.user.id, body);
  }

  @Delete(':id')
  delete(@Req() req, @Param('id') id: string) {
    return this.conversionRuleService.delete(id, req.user.id);
  }

  @Get(':id/preview')
  preview(@Req() req, @Param('id') id: string) {
    return this.conversionRuleService.preview(id, req.user.id);
  }
}
