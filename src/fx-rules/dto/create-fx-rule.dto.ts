import {
    FxRuleTriggerType,
    RateDirection,
    ThresholdDirection,
  } from '../fx-rules.types';
  
  export interface CreateFxRuleDto {
    accountId: string;
    triggerType: FxRuleTriggerType;
    sourceCurrency: string;
    destinationCurrency: string;
    conversionAmountMode?: 'FULL_BALANCE' | 'FIXED_AMOUNT';
    fixedAmount?: number;
    thresholdAmount?: number;
    thresholdDirection?: ThresholdDirection;
    rate?: number;
    rateDirection?: RateDirection;
    isActive?: boolean;
  }
  