import {
  BadRequestException,
  Injectable,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { TransactionsService } from '../transactions/transactions.service';
import { TransactionRecord } from '../transactions/transactions.types';
import { WalletsService } from '../wallets/wallets.service';
import { CreateFxRuleDto } from './dto/create-fx-rule.dto';
import { FxRatesService } from './fx-rates.service';
import {
  FxRule,
  RuleExecutionHistory,
  RulePreviewResult,
} from './fx-rules.types';

@Injectable()
export class FxRulesService {
  private readonly rules: FxRule[] = [];
  private readonly executionHistory: RuleExecutionHistory[] = [];

  constructor(
    private readonly walletsService: WalletsService,
    private readonly fxRatesService: FxRatesService,
    @Inject(forwardRef(() => TransactionsService))
    private readonly transactionsService: TransactionsService,
  ) {}

  createRule(dto: CreateFxRuleDto): FxRule {
    this.validateRule(dto);

    const rule: FxRule = {
      id: `rule_${this.rules.length + 1}`,
      accountId: dto.accountId,
      triggerType: dto.triggerType,
      sourceCurrency: dto.sourceCurrency.toUpperCase(),
      destinationCurrency: dto.destinationCurrency.toUpperCase(),
      conversionAmountMode: dto.conversionAmountMode ?? 'FULL_BALANCE',
      fixedAmount: dto.fixedAmount,
      isActive: dto.isActive ?? true,
      config: {
        thresholdAmount: dto.thresholdAmount,
        thresholdDirection: dto.thresholdDirection,
        rate: dto.rate,
        rateDirection: dto.rateDirection,
      },
      createdAt: new Date().toISOString(),
    };

    this.rules.push(rule);
    return rule;
  }

  getPreview(ruleId: string): { rule: FxRule; preview: RulePreviewResult } {
    const rule = this.getRule(ruleId);
    return {
      rule,
      preview: this.previewRule(rule),
    };
  }

  handleIncomingTransaction(transaction: TransactionRecord): RuleExecutionHistory[] {
    const matchingRules = this.rules.filter(
      (rule) =>
        rule.isActive &&
        rule.accountId === transaction.accountId &&
        (rule.triggerType === 'ON_RECEIVE' ||
          rule.triggerType === 'BALANCE_THRESHOLD') &&
        rule.sourceCurrency === transaction.sourceCurrency,
    );

    return matchingRules.map((rule) =>
      this.executeRule(rule, {
        eventType: 'TRANSACTION_RECEIVED',
        transactionId: transaction.id,
        incomingAmount: transaction.sourceAmount,
        currentBalance: this.walletsService.getBalance(
          transaction.accountId,
          transaction.sourceCurrency,
        ).balance,
        previousBalance:
          this.walletsService.getBalance(
            transaction.accountId,
            transaction.sourceCurrency,
          ).balance - transaction.sourceAmount,
      }),
    );
  }

  handleRateUpdate(
    baseCurrency: string,
    quoteCurrency: string,
    previousRate?: number,
    currentRate?: number,
  ): RuleExecutionHistory[] {
    const normalizedBase = baseCurrency.toUpperCase();
    const normalizedQuote = quoteCurrency.toUpperCase();
    const matchingRules = this.rules.filter(
      (rule) =>
        rule.isActive &&
        rule.triggerType === 'RATE_THRESHOLD' &&
        rule.sourceCurrency === normalizedBase &&
        rule.destinationCurrency === normalizedQuote,
    );

    return matchingRules.map((rule) =>
      this.executeRule(rule, {
        eventType: 'RATE_UPDATED',
        pair: `${normalizedBase}/${normalizedQuote}`,
        previousRate,
        currentRate,
      }),
    );
  }

  listExecutionHistory(accountId?: string): RuleExecutionHistory[] {
    if (!accountId) {
      return this.executionHistory;
    }

    return this.executionHistory.filter((entry) => entry.accountId === accountId);
  }

  private previewRule(
    rule: FxRule,
    triggerContext?: Record<string, unknown>,
  ): RulePreviewResult {
    const currentBalance = this.walletsService.getBalance(
      rule.accountId,
      rule.sourceCurrency,
    ).balance;
    const availableAmount =
      rule.triggerType === 'ON_RECEIVE' &&
      typeof triggerContext?.incomingAmount === 'number'
        ? Number(triggerContext.incomingAmount)
        : currentBalance;
    const sourceAmount =
      rule.conversionAmountMode === 'FIXED_AMOUNT'
        ? Math.min(rule.fixedAmount ?? 0, availableAmount)
        : availableAmount;

    if (sourceAmount <= 0) {
      return {
        canExecute: false,
        reason: 'No convertible balance available.',
      };
    }

    if (rule.triggerType === 'BALANCE_THRESHOLD') {
      const thresholdAmount = rule.config.thresholdAmount ?? 0;
      const hasPreviousBalance = typeof triggerContext?.previousBalance === 'number';
      const previousBalance = hasPreviousBalance
        ? Number(triggerContext.previousBalance)
        : currentBalance;
      const passes = hasPreviousBalance
        ? rule.config.thresholdDirection === 'BELOW'
          ? previousBalance >= thresholdAmount && currentBalance < thresholdAmount
          : previousBalance <= thresholdAmount && currentBalance > thresholdAmount
        : rule.config.thresholdDirection === 'BELOW'
          ? currentBalance < thresholdAmount
          : currentBalance > thresholdAmount;

      if (!passes) {
        return {
          canExecute: false,
          reason: `Balance threshold crossing not met. Current balance is ${currentBalance}.`,
        };
      }
    }

    const rate = this.fxRatesService.getRate(
      rule.sourceCurrency,
      rule.destinationCurrency,
    );

    if (rule.triggerType === 'RATE_THRESHOLD') {
      const targetRate = rule.config.rate ?? 0;
      const hasPreviousRate = typeof triggerContext?.previousRate === 'number';
      const previousRate = hasPreviousRate
        ? Number(triggerContext.previousRate)
        : rate;
      const currentRate =
        typeof triggerContext?.currentRate === 'number'
          ? Number(triggerContext.currentRate)
          : rate;
      const passes = hasPreviousRate
        ? rule.config.rateDirection === 'BELOW'
          ? previousRate >= targetRate && currentRate < targetRate
          : previousRate <= targetRate && currentRate > targetRate
        : rule.config.rateDirection === 'BELOW'
          ? currentRate < targetRate
          : currentRate > targetRate;

      if (!passes) {
        return {
          canExecute: false,
          reason: `Rate threshold crossing not met. Current rate is ${currentRate}.`,
          rate: currentRate,
        };
      }
    }

    return {
      canExecute: true,
      reason: 'Rule would execute now.',
      sourceAmount,
      destinationAmount: Number((sourceAmount * rate).toFixed(2)),
      rate,
    };
  }

  private executeRule(
    rule: FxRule,
    triggerContext: Record<string, unknown>,
  ): RuleExecutionHistory {
    const preview = this.previewRule(rule, triggerContext);

    if (!preview.canExecute || !preview.sourceAmount || !preview.rate) {
      return this.recordHistory({
        rule,
        status: 'SKIPPED',
        message: preview.reason,
        preview,
      });
    }

    const transaction = this.transactionsService.createFxConversion({
      accountId: rule.accountId,
      fromCurrency: rule.sourceCurrency,
      toCurrency: rule.destinationCurrency,
      fromAmount: preview.sourceAmount,
      rate: preview.rate,
      ruleId: rule.id,
      triggerContext,
    });

    return this.recordHistory({
      rule,
      status: 'EXECUTED',
      message: 'Auto-conversion executed successfully.',
      preview,
      transaction,
    });
  }

  private recordHistory(input: {
    rule: FxRule;
    status: 'EXECUTED' | 'SKIPPED';
    message: string;
    preview: RulePreviewResult;
    transaction?: TransactionRecord;
  }): RuleExecutionHistory {
    const history: RuleExecutionHistory = {
      id: `hist_${this.executionHistory.length + 1}`,
      ruleId: input.rule.id,
      accountId: input.rule.accountId,
      triggerType: input.rule.triggerType,
      status: input.status,
      message: input.message,
      preview: input.preview,
      transaction: input.transaction,
      createdAt: new Date().toISOString(),
    };

    this.executionHistory.push(history);
    return history;
  }

  private getRule(ruleId: string): FxRule {
    const rule = this.rules.find((entry) => entry.id === ruleId);
    if (!rule) {
      throw new BadRequestException(`FX rule ${ruleId} not found.`);
    }

    return rule;
  }

  private validateRule(dto: CreateFxRuleDto): void {
    if (!dto.accountId || !dto.sourceCurrency || !dto.destinationCurrency) {
      throw new BadRequestException(
        'accountId, sourceCurrency and destinationCurrency are required.',
      );
    }

    if (dto.sourceCurrency.toUpperCase() === dto.destinationCurrency.toUpperCase()) {
      throw new BadRequestException(
        'sourceCurrency and destinationCurrency must be different.',
      );
    }

    if (dto.conversionAmountMode === 'FIXED_AMOUNT') {
      if (!dto.fixedAmount || dto.fixedAmount <= 0) {
        throw new BadRequestException(
          'fixedAmount must be provided for FIXED_AMOUNT rules.',
        );
      }
    }

    if (dto.triggerType === 'BALANCE_THRESHOLD') {
      if (!dto.thresholdAmount || !dto.thresholdDirection) {
        throw new BadRequestException(
          'thresholdAmount and thresholdDirection are required for BALANCE_THRESHOLD rules.',
        );
      }
    }

    if (dto.triggerType === 'RATE_THRESHOLD') {
      if (!dto.rate || !dto.rateDirection) {
        throw new BadRequestException(
          'rate and rateDirection are required for RATE_THRESHOLD rules.',
        );
      }
    }
  }
}
