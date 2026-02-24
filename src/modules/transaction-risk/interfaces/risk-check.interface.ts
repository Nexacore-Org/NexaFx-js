export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface RiskCheckContext {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  deviceKey?: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export interface RiskCheckResult {
  checkName: string;
  triggered: boolean;
  score: number;
  reason: string;
}
