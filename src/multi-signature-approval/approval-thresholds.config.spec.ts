import {
  DEFAULT_APPROVAL_THRESHOLDS,
  GLOBAL_APPROVAL_THRESHOLD_USD,
  HIGH_VALUE_THRESHOLD_USD,
  HIGH_VALUE_REQUIRED_APPROVALS,
} from './approval-thresholds.config';

describe('Approval Thresholds Configuration', () => {
  it('has USD threshold of 10000', () => {
    const usd = DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === 'USD');
    expect(usd?.minAmount).toBe(10000);
    expect(usd?.requiredApprovals).toBe(2);
  });

  it('has BTC threshold of 0.5 with 3 required approvals', () => {
    const btc = DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === 'BTC');
    expect(btc?.minAmount).toBe(0.5);
    expect(btc?.requiredApprovals).toBe(3);
  });

  it('has a wildcard threshold as fallback', () => {
    const wildcard = DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === '*');
    expect(wildcard).toBeDefined();
    expect(wildcard?.requiredApprovals).toBeGreaterThanOrEqual(2);
  });

  it('GLOBAL_APPROVAL_THRESHOLD_USD matches USD threshold', () => {
    const usd = DEFAULT_APPROVAL_THRESHOLDS.find((t) => t.currency === 'USD');
    expect(GLOBAL_APPROVAL_THRESHOLD_USD).toBe(usd?.minAmount);
  });

  it('high-value threshold requires 3 approvals', () => {
    expect(HIGH_VALUE_REQUIRED_APPROVALS).toBe(3);
    expect(HIGH_VALUE_THRESHOLD_USD).toBeGreaterThan(GLOBAL_APPROVAL_THRESHOLD_USD);
  });
});
