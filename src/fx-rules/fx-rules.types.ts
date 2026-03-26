import { TransactionRecord } from '../transactions/transactions.types';

export type FxRuleTriggerType =
  | 'ON_RECEIVE'
  | 'BALANCE_THRESHOLD'
  | 'RATE_THRESHOLD';

export type ThresholdDirection = 'ABOVE' | 'BELOW';
export type RateDirection = 'ABOVE' | 'BELOW';

export interface FxRule {
  id: string;
  accountId: string;
  triggerType: FxRuleTriggerType;
  sourceCurrency: string;
  destinationCurrency: string;
  conversionAmountMode: 'FULL_BALANCE' | 'FIXED_AMOUNT';
  fixedAmount?: number;
  isActive: boolean;
  config: {
    thresholdAmount?: number;
    thresholdDirection?: ThresholdDirection;
    rate?: number;
    rateDirection?: RateDirection;
  };
  createdAt: string;
}

export interface RulePreviewResult {
  canExecute: boolean;
  reason: string;
  sourceAmount?: number;
  destinationAmount?: number;
  rate?: number;
}

export interface RuleExecutionHistory {
  id: string;
  ruleId: string;
  accountId: string;
  triggerType: FxRuleTriggerType;
  status: 'EXECUTED' | 'SKIPPED';
  message: string;
  preview: RulePreviewResult;
  transaction?: TransactionRecord;
  createdAt: string;
}
