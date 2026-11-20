import { RateAlertEvent } from '../rate-alert.events';
import { RateAlertHistoryListener } from './rate-alert-history.listener';
import { RateAlertHistoryService } from './rate-alert-history.service';

describe('RateAlertHistoryListener', () => {
  it('records a history row from a typed trigger event', async () => {
    const historyService = { recordAlert: jest.fn().mockResolvedValue({}) };
    const listener = new RateAlertHistoryListener(
      historyService as unknown as RateAlertHistoryService,
    );
    const event = {
      alertId: 'alert-1',
      userId: 'user-1',
      currencyPair: 'USD/NGN',
      rate: 1550,
      targetRate: 1500,
      direction: 'above',
    };

    await listener.onTriggered(event);

    expect(historyService.recordAlert).toHaveBeenCalledWith({
      alertId: 'alert-1',
      userId: 'user-1',
      currencyPair: 'USD/NGN',
      triggeredRate: 1550,
      targetRate: 1500,
      direction: 'above',
    });
    expect(RateAlertEvent.TRIGGERED).toBe('rate-alert.triggered');
  });

  it('does not reject when history persistence fails', async () => {
    const listener = new RateAlertHistoryListener({
      recordAlert: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as RateAlertHistoryService);

    await expect(
      listener.onTriggered({
        alertId: 'alert-1',
        userId: 'user-1',
        currencyPair: 'USD/NGN',
        rate: 1,
        targetRate: 1,
        direction: 'above',
      }),
    ).resolves.toBeUndefined();
  });
});
