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
