export interface RiskIndicatorResult {
  indicator: string;
  weight: number;
  description: string;
  triggered: boolean;
}

export interface RiskCalculationContext {
  walletId: string;
  transactions?: any[];
  timeWindowHours?: number;
}
