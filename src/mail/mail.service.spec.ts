import { MailService } from './mail.service';

describe('MailService.renderAdminAlertHtml', () => {
  const svc = new MailService();

  it('escapes HTML-special characters in subject, body and metadata', () => {
    const html = svc.renderAdminAlertHtml({
      to: 'admin@example.com',
      subject: '<script>alert(1)</script>',
      body: '<img src=x onerror=alert(2)>',
      metadata: { note: '<b>hi</b>' },
    } as any);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img');
  });
});

describe('MailService templates', () => {
  const svc = new MailService();

  beforeAll(() => svc.onModuleInit());

  it('precompiles every template at boot, including localised variants', () => {
    expect(() => svc.onModuleInit()).not.toThrow();
  });

  it.each([
    [
      'welcome',
      () => svc.renderWelcome({ fullName: 'Ada' }),
      'Welcome to NexaFx',
    ],
    [
      'password reset',
      () => svc.renderPasswordReset({ fullName: 'Ada', resetUrl: 'https://x.test/r' }),
      'Reset your NexaFx password',
    ],
    [
      'transaction confirmation',
      () =>
        svc.renderTransactionConfirmation({
          fullName: 'Ada',
          description: 'Transfer',
          amount: '10 USD',
          status: 'completed',
          transactionId: 'tx-1',
          date: '2026-01-01',
        }),
      'Transaction confirmed',
    ],
  ])('renders the %s template inside the base layout', (_name, render, title) => {
    const html = render();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(title);
    expect(html).toContain(String(new Date().getFullYear()));
  });
});

describe('MailService.send', () => {
  it('rejects transport errors instead of swallowing them', async () => {
    const svc = new MailService();
    jest
      .spyOn((svc as any).transporter, 'sendMail')
      .mockRejectedValue(new Error('SMTP down'));

    await expect(
      svc.send({ to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>' }),
    ).rejects.toThrow('SMTP down');
  });

  it('rejects a payload without a recipient or subject', async () => {
    const svc = new MailService();
    await expect(svc.send({ to: '', subject: 'Hi' })).rejects.toThrow(
      'Missing required email fields',
    );
  });
});
