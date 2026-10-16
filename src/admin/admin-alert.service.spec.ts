import { AdminAlertService } from './admin-alert.service';

jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue({}) }));

function build(opts: { repo?: boolean } = {}) {
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key === 'ADMIN_ALERT_EMAIL' ? 'ops@example.com' : key === 'ADMIN_ALERT_SLACK_WEBHOOK_URL' ? '' : fallback,
    ),
  };
  const mail = { sendAdminAlert: jest.fn().mockResolvedValue(undefined) };
  const cache = { get: jest.fn(), set: jest.fn() };
  const rows: any[] = [];
  const repo = {
    create: jest.fn((v) => ({ id: `a${rows.length}`, ...v })),
    save: jest.fn(async (v) => { rows.push(v); return v; }),
    find: jest.fn(async () => [...rows].reverse()),
  };
  const service = new AdminAlertService(config as any, mail as any, cache as any, (opts.repo === false ? undefined : repo) as any);
  return { service, mail, repo, rows };
}

const lockout = (userId: string, severity: 'high' | 'critical' = 'high') => ({
  type: 'account-lockout',
  severity,
  title: 'Account Locked',
  message: `User ${userId} locked`,
  metadata: { userId },
});

describe('AdminAlertService rate limiting (#1370)', () => {
  it('sends alerts for different users of the same type instead of dropping them', async () => {
    const { service, mail } = build();
    await service.sendAlert(lockout('u1'));
    await service.sendAlert(lockout('u2'));
    await service.sendAlert(lockout('u3'));
    expect(mail.sendAdminAlert).toHaveBeenCalledTimes(3);
  });

  it('suppresses a repeat for the same incident within the window', async () => {
    const { service, mail } = build();
    await service.sendAlert(lockout('u1'));
    await service.sendAlert(lockout('u1'));
    expect(mail.sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it('never suppresses critical alerts', async () => {
    const { service, mail } = build();
    await service.sendAlert(lockout('u1', 'critical'));
    await service.sendAlert(lockout('u1', 'critical'));
    expect(mail.sendAdminAlert).toHaveBeenCalledTimes(2);
  });

  it('only one of several concurrent first alerts for an incident is sent', async () => {
    const { service, mail } = build();
    await Promise.all(Array.from({ length: 5 }, () => service.sendAlert(lockout('u1'))));
    expect(mail.sendAdminAlert).toHaveBeenCalledTimes(1);
  });

  it('adds a digest of suppressed alerts to the next alert of that type', async () => {
    const { service, mail } = build();
    await service.sendAlert(lockout('u1'));
    await service.sendAlert(lockout('u1')); // suppressed
    await service.sendAlert(lockout('u1')); // suppressed
    // A new incident of the same type is sent and carries the digest.
    await service.sendAlert(lockout('u2'));
    const body = mail.sendAdminAlert.mock.calls[1][0].body as string;
    expect(body).toContain('2 more account-lockout alert(s)');
  });

  it('flushes a standalone digest after the window passes with no new alert', async () => {
    const { service, mail } = build();
    await service.sendAlert(lockout('u1'));
    await service.sendAlert(lockout('u1')); // suppressed
    const realNow = Date.now;
    Date.now = () => realNow() + 16 * 60_000;
    try {
      await service.flushSuppressedDigests();
    } finally {
      Date.now = realNow;
    }
    const last = mail.sendAdminAlert.mock.calls.at(-1)![0];
    expect(last.subject).toContain('Suppressed account-lockout alerts');
  });
});

describe('AdminAlertService history (#1370)', () => {
  it('records event-driven alerts, not only broadcast ones, and persists suppressed ones too', async () => {
    const { service, rows } = build();
    await service.handleAccountLockout(lockout('u1'));
    await service.handleAccountLockout(lockout('u1'));
    expect(service.getRecentAlerts()).toHaveLength(2);
    expect(rows.map((r) => r.suppressed)).toEqual([false, true]);
    expect(rows[0].subject).toBe('u1');
  });

  it('lists alerts from the store', async () => {
    const { service } = build();
    await service.sendAlert(lockout('u1'));
    const listed = await service.listAlerts(10);
    expect(listed).toHaveLength(1);
  });

  it('falls back to in-memory history without a repository', async () => {
    const { service } = build({ repo: false });
    await service.sendAlert(lockout('u1'));
    expect(await service.listAlerts(10)).toHaveLength(1);
  });
});
