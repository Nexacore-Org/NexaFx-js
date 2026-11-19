import { UsersService } from './users.service';

/**
 * Issue #1534. The SQL itself needs a real Postgres to execute; these tests pin the generated
 * expressions and the newly-locked detection so the behaviour cannot silently regress.
 */
function build(raw: Array<{ failedLoginAttempts: number; lockedUntil: Date | null }>) {
  let setArg: Record<string, () => string> = {};
  let params: Record<string, unknown> = {};
  const qb: any = {
    update: jest.fn(() => qb),
    set: jest.fn((v) => {
      setArg = v;
      return qb;
    }),
    where: jest.fn(() => qb),
    setParameters: jest.fn((p) => {
      params = p;
      return qb;
    }),
    returning: jest.fn(() => qb),
    execute: jest.fn(async () => ({ raw })),
  };
  const repo: any = { createQueryBuilder: jest.fn(() => qb) };
  const service = new UsersService(repo, {} as any, {} as any);
  return { service, getSet: () => setArg, getParams: () => params };
}

describe('UsersService.recordFailedLogin (issue #1534)', () => {
  it('restarts the count when the previous lock has expired', async () => {
    const { service, getSet } = build([{ failedLoginAttempts: 1, lockedUntil: null }]);

    await service.recordFailedLogin('u1', 5, 30);

    const count = getSet().failedLoginAttempts();
    expect(count).toContain('"lockedUntil" IS NOT NULL AND "lockedUntil" <= now()');
    expect(count).toMatch(/THEN 1 ELSE "failedLoginAttempts" \+ 1/);
  });

  it('only locks when the (possibly reset) count reaches the threshold, and clears an expired lock otherwise', async () => {
    const { service, getSet } = build([{ failedLoginAttempts: 1, lockedUntil: null }]);

    await service.recordFailedLogin('u1', 5, 30);

    const lock = getSet().lockedUntil();
    expect(lock).toContain('>= :maxAttempts THEN :lockUntil');
    expect(lock).toContain('THEN NULL');
    expect(lock).toContain('ELSE "lockedUntil" END');
  });

  it('reports newlyLocked only for the call that set the lock', async () => {
    const lockedNow = new Date();
    const { service, getParams } = build([{ failedLoginAttempts: 5, lockedUntil: lockedNow }]);
    // Make the stored value equal to the lock this call computes.
    const spy = jest.spyOn(Date, 'now').mockReturnValue(lockedNow.getTime() - 30 * 60_000);

    const first = await service.recordFailedLogin('u1', 5, 30);
    spy.mockRestore();

    expect(first.newlyLocked).toBe(true);
    expect(first.lockedUntil?.getTime()).toBe(lockedNow.getTime());
    expect((getParams().lockUntil as Date).getTime()).toBe(lockedNow.getTime());
  });

  it('does not report a lock that was already there', async () => {
    const older = new Date(Date.now() + 10 * 60_000);
    const { service } = build([{ failedLoginAttempts: 5, lockedUntil: older }]);

    const result = await service.recordFailedLogin('u1', 5, 30);

    expect(result.newlyLocked).toBe(false);
  });

  it('reports no lock below the threshold', async () => {
    const { service } = build([{ failedLoginAttempts: 2, lockedUntil: null }]);
    const result = await service.recordFailedLogin('u1', 5, 30);
    expect(result).toMatchObject({ failedLoginAttempts: 2, lockedUntil: null, newlyLocked: false });
  });
});
