import { Logger } from '@nestjs/common';
import { IdempotencyCleanupJob } from './cleanup.job';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyCleanupJob', () => {
  const cleanupMock = jest.fn();
  const idempotencyService = {
    cleanup: cleanupMock,
  } as unknown as IdempotencyService;
  const job = new IdempotencyCleanupJob(idempotencyService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs and delegates cleanup execution', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    cleanupMock.mockResolvedValue(3);

    await job.cleanupExpiredKeys();

    expect(cleanupMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Running idempotency key cleanup...');
    expect(logSpy).toHaveBeenCalledWith(
      'Cleaned up 3 expired idempotency keys',
    );

    logSpy.mockRestore();
  });
});
