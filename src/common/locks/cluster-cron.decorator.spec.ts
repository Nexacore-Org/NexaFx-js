import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants';
import { ClusterCron } from './cluster-cron.decorator';
import { setActiveLockService } from './lock-registry';

class SampleJob {
  calls = 0;

  @ClusterCron('* * * * *', 'sample:job', { ttlMs: 1234 })
  async run(): Promise<string> {
    this.calls += 1;
    return 'done';
  }

  @ClusterCron('* * * * *', 'sample:local', { perInstance: true })
  async runLocal(): Promise<string> {
    this.calls += 1;
    return 'local';
  }
}

describe('@ClusterCron (issue #1550)', () => {
  afterEach(() => setActiveLockService(undefined));

  it('skips the job body when the lock is held by another instance', async () => {
    const runExclusive = jest.fn().mockResolvedValue({ ran: false });
    setActiveLockService({ runExclusive } as any);
    const job = new SampleJob();

    await expect(job.run()).resolves.toBeUndefined();

    expect(job.calls).toBe(0);
    expect(runExclusive).toHaveBeenCalledWith('sample:job', 1234, expect.any(Function));
  });

  it('runs the body and returns its result when the lock is acquired', async () => {
    setActiveLockService({
      runExclusive: jest.fn(async (_k: string, _t: number, fn: () => unknown) => ({ ran: true, result: await fn() })),
    } as any);
    const job = new SampleJob();

    await expect(job.run()).resolves.toBe('done');
    expect(job.calls).toBe(1);
  });

  it('runs unlocked when no lock service is registered (unit tests)', async () => {
    const job = new SampleJob();
    await expect(job.run()).resolves.toBe('done');
  });

  it('does not lock perInstance jobs', async () => {
    const runExclusive = jest.fn();
    setActiveLockService({ runExclusive } as any);
    const job = new SampleJob();

    await expect(job.runLocal()).resolves.toBe('local');
    expect(runExclusive).not.toHaveBeenCalled();
  });

  it('still registers the method with the Nest scheduler', () => {
    expect(Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, SampleJob.prototype.run)).toBeDefined();
  });
});
