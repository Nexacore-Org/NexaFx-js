import { AccountClosurePurgeJob } from './account-closure.purge.job';

/** Issue #1538 */
describe('AccountClosurePurgeJob (issue #1538)', () => {
  function build(due: Array<{ id: string }>) {
    const repo = { find: jest.fn().mockResolvedValue(due), update: jest.fn().mockResolvedValue({ affected: 1 }) };
    return { job: new AccountClosurePurgeJob(repo as any), repo };
  }

  it('only selects rows whose purge date has passed and that are not purged yet, including soft-deleted ones', async () => {
    const { job, repo } = build([]);

    await job.purgeExpiredPersonalData();

    const arg = repo.find.mock.calls[0][0];
    expect(arg.withDeleted).toBe(true);
    expect(Object.keys(arg.where).sort()).toEqual(['piiPurgeAt', 'piiPurgedAt']);
    expect(arg.where.piiPurgeAt._type).toBe('lessThanOrEqual');
    expect(arg.where.piiPurgedAt._type).toBe('isNull');
  });

  it('anonymises each due row and makes the credential unusable', async () => {
    const { job, repo } = build([{ id: 'u1' }, { id: 'u2' }]);

    await expect(job.purgeExpiredPersonalData()).resolves.toBe(2);

    const patch = repo.update.mock.calls[0][1];
    expect(patch).toMatchObject({ email: 'deleted-u1@archived.local', firstName: '[deleted]', lastName: '[deleted]', isActive: false });
    expect(patch.piiPurgedAt).toBeInstanceOf(Date);
    expect(patch.passwordHash).toMatch(/^purged:[0-9a-f]{48}$/);
    expect(patch.passwordHash.startsWith('$')).toBe(false); // not a valid bcrypt hash
  });

  it('each purged credential is different', async () => {
    const { job, repo } = build([{ id: 'u1' }, { id: 'u2' }]);
    await job.purgeExpiredPersonalData();
    expect(repo.update.mock.calls[0][1].passwordHash).not.toBe(repo.update.mock.calls[1][1].passwordHash);
  });

  it('does nothing when nothing is due', async () => {
    const { job, repo } = build([]);
    await expect(job.purgeExpiredPersonalData()).resolves.toBe(0);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
