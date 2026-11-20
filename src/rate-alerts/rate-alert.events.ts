export enum RateAlertEvent {
  TRIGGERED = 'rate-alert.triggered',
}

export interface RateAlertTriggeredEvent {
  alertId: string;
  userId: string;
  currencyPair: string;
  rate: number;
  targetRate: number;
  direction: string;
}
