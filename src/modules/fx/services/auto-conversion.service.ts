import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConversionRule,
  ConversionRuleTriggerType,
} from '../entities/conversion-rule.entity';
import { RuleExecutionHistory } from '../entities/rule-execution-history.entity';

@Injectable()
export class AutoConversionService {
  constructor(
    @InjectRepository(ConversionRule)
    private readonly ruleRepository: Repository<ConversionRule>,
    @InjectRepository(RuleExecutionHistory)
    private readonly historyRepository: Repository<RuleExecutionHistory>,
  ) {}

  async handleOnReceive(currency: string, amount: number) {
    const rules = await this.ruleRepository.find({
      where: {
        triggerType: ConversionRuleTriggerType.ON_RECEIVE,
        fromCurrency: currency,
        isActive: true,
      },
    });

    for (const rule of rules) {
      await this.executeRule(rule, amount);
    }
  }

  async handleBalanceThreshold(currency: string, balance: number) {
    const rules = await this.ruleRepository.find({
      where: {
        triggerType: ConversionRuleTriggerType.BALANCE_THRESHOLD,
        fromCurrency: currency,
        isActive: true,
      },
    });

    for (const rule of rules) {
      if (balance >= Number(rule.thresholdValue)) {
        await this.executeRule(rule, balance);
      }
    }
  }

  async handleRateThreshold(rate: number) {
    const rules = await this.ruleRepository.find({
      where: {
        triggerType: ConversionRuleTriggerType.RATE_THRESHOLD,
        isActive: true,
      },
    });

    for (const rule of rules) {
      if (rate >= Number(rule.rateValue)) {
        await this.executeRule(rule, 100);
      }
    }
  }

  private async executeRule(rule: ConversionRule, amount: number) {
    const idempotencyKey = `rule-${rule.id}-${Date.now()}`;

    // Plug into existing manual conversion service here

    await this.historyRepository.save({
      rule,
      fromCurrency: rule.fromCurrency,
      toCurrency: rule.toCurrency,
      amount,
      idempotencyKey,
      status: 'SUCCESS',
    });
  }
}
