import { NotFoundException } from '@nestjs/common';
import { TRANSACTION_CREATED } from '../../transactions/events';
import { WebhookSandboxService } from './webhook-sandbox.service';

describe('WebhookSandboxService', () => {
  it('dispatches a sample event through the webhook dispatcher', async () => {
    const dispatch = jest.fn().mockResolvedValue({ success: true, sentTo: 2 });
    const service = new WebhookSandboxService({
      dispatch,
    } as any);

    const result = await service.sendTestEvent(TRANSACTION_CREATED);

    expect(dispatch).toHaveBeenCalledWith(
      TRANSACTION_CREATED,
      expect.objectContaining({
        sandbox: true,
      }),
    );
    expect(result.sentTo).toBe(2);
  });

  it('rejects unsupported webhook event types', async () => {
    const service = new WebhookSandboxService({
      dispatch: jest.fn(),
    } as any);

    await expect(service.sendTestEvent('transaction.unknown')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
