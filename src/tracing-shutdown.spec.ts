import { shutdownWithTimeout } from './tracing-shutdown';

describe('shutdownWithTimeout', () => {
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    logger.warn.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('resolves true when the SDK shuts down in time', async () => {
    const shutdown = jest.fn().mockResolvedValue(undefined);

    await expect(shutdownWithTimeout(shutdown, 5_000, logger)).resolves.toBe(true);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('resolves false (and does not hang) when the exporter never finishes', async () => {
    const shutdown = jest.fn(() => new Promise<void>(() => undefined));

    const promise = shutdownWithTimeout(shutdown, 5_000, logger);
    await jest.advanceTimersByTimeAsync(5_000);

    await expect(promise).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('5000ms'));
  });

  it('swallows exporter errors', async () => {
    const shutdown = jest.fn().mockRejectedValue(new Error('collector down'));

    await expect(shutdownWithTimeout(shutdown, 5_000, logger)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('collector down'));
  });

  it('never calls process.exit', async () => {
    const exit = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);

    await shutdownWithTimeout(jest.fn().mockResolvedValue(undefined), 5_000, logger);
    const hanging = shutdownWithTimeout(() => new Promise<void>(() => undefined), 10, logger);
    await jest.advanceTimersByTimeAsync(10);
    await hanging;

    expect(exit).not.toHaveBeenCalled();
  });
});
