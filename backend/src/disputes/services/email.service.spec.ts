import { ConfigService } from '@nestjs/config';
import { EmailService } from './email.service';
import * as sgMail from '@sendgrid/mail';

jest.mock('@sendgrid/mail', () => ({
  setApiKey: jest.fn(),
  send: jest.fn().mockResolvedValue(true),
}));

describe('EmailService HTML escaping', () => {
  let service: EmailService;
  let sentMessage: any | null;

  beforeEach(() => {
    (sgMail.send as jest.Mock).mockImplementation(async (msg: any) => {
      sentMessage = msg;
      return true;
    });
    sentMessage = null;

    const mockConfig = {
      get: (key: string, defaultValue?: any) => {
        if (key === 'EMAIL_ENABLED') return 'true';
        if (key === 'SENDGRID_API_KEY') return 'dummy-api-key';
        if (key === 'SENDGRID_FROM_EMAIL') return 'noreply@example.com';
        return defaultValue;
      },
    } as unknown as ConfigService;

    service = new EmailService(mockConfig);
  });

  it('escapes user-controlled fields in sendDisputeCreatedEmail', async () => {
    const userEmail = 'victim@example.com';
    const userName = '\u003Cscript\u003Ealert(1)\u003C/script\u003E'; // "<script>alert(1)</script>"
    const disputeId = '123\u003Cb\u003Ebold\u003C/b\u003E'; // "123<b>bold</b>"
    const category = '\u003Cimg src=x onerror=alert(1)\u003E';

    await service.sendDisputeCreatedEmail(
      userEmail,
      userName,
      disputeId,
      category,
    );

    expect(sgMail.send).toHaveBeenCalled();
    expect(sentMessage).toBeTruthy();
    const html: string = sentMessage.html;

    // No raw tags should appear
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');

    // Escaped content should be present
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('123&lt;b&gt;bold&lt;/b&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('escapes in sendDisputeResolvedEmail including outcome and refund text', async () => {
    await service.sendDisputeResolvedEmail(
      'victim@example.com',
      'Alice <Admin>',
      'id-<unsafe>',
      'user_favor',
      5000,
    );

    expect(sgMail.send).toHaveBeenCalled();
    const html: string = (sentMessage && sentMessage.html) || '';
    expect(html).toContain('Dear Alice &lt;Admin&gt;');
    expect(html).toContain('id-&lt;unsafe&gt;');
    // Outcome is mapped then escaped
    expect(html).toContain('Resolved in Your Favor');
  });
});


