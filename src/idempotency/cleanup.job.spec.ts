import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdempotencyCleanupJob } from './cleanup.job';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyCleanupJob', () => {
  const cleanupMock = jest.fn();
  const idempotencyService = {
    cleanup: cleanupMock,
  } as unknown as IdempotencyService;
  const configService = {} as ConfigService;
  const job = new IdempotencyCleanupJob(idempotencyService, configService);

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

  it('cleanup job fires exactly once per invocation', async () => {
    cleanupMock.mockResolvedValue(0);
    await job.cleanupExpiredKeys();
    expect(cleanupMock).toHaveBeenCalledTimes(1);
  });
});
