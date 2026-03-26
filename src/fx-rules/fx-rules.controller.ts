import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateFxRuleDto } from './dto/create-fx-rule.dto';
import { SetRateDto } from './dto/set-rate.dto';
import { FxRatesService } from './fx-rates.service';
import { FxRulesService } from './fx-rules.service';

@Controller('fx')
export class FxRulesController {
  constructor(
    private readonly fxRulesService: FxRulesService,
    private readonly fxRatesService: FxRatesService,
  ) {}

  @Post('rules')
  createRule(@Body() dto: CreateFxRuleDto) {
    return this.fxRulesService.createRule(dto);
  }

  @Get('rules/:id/preview')
  previewRule(@Param('id') id: string) {
    return this.fxRulesService.getPreview(id);
  }

  @Post('rates')
  setRate(@Body() dto: SetRateDto) {
    const rateUpdate = this.fxRatesService.setRate(
      dto.baseCurrency,
      dto.quoteCurrency,
      dto.rate,
    );
    const executions = this.fxRulesService.handleRateUpdate(
      dto.baseCurrency,
      dto.quoteCurrency,
      rateUpdate.previousRate,
      rateUpdate.currentRate,
    );

    return {
      pair: `${dto.baseCurrency.toUpperCase()}/${dto.quoteCurrency.toUpperCase()}`,
      rate: dto.rate,
      ruleExecutions: executions,
    };
  }
}
