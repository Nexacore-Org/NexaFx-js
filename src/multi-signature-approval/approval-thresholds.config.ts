export interface ApprovalThreshold {
  currency: string;
  minAmount: number;
  requiredApprovals: number;
}

export const DEFAULT_APPROVAL_THRESHOLDS: ApprovalThreshold[] = [
  { currency: 'USD', minAmount: 10000, requiredApprovals: 2 },
  { currency: 'EUR', minAmount: 9000, requiredApprovals: 2 },
  { currency: 'GBP', minAmount: 8000, requiredApprovals: 2 },
  { currency: 'BTC', minAmount: 0.5, requiredApprovals: 3 },
  { currency: 'ETH', minAmount: 5, requiredApprovals: 3 },
  // Default for any other currency (USD equivalent threshold)
  { currency: '*', minAmount: 10000, requiredApprovals: 2 },
];

export const GLOBAL_APPROVAL_THRESHOLD_USD = 10000;
export const HIGH_VALUE_THRESHOLD_USD = 50000;
export const HIGH_VALUE_REQUIRED_APPROVALS = 3;
