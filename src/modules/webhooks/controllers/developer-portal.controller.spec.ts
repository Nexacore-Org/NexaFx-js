import { DeveloperPortalController } from './developer-portal.controller';

describe('DeveloperPortalController', () => {
  it('renders the developer portal with webhook event catalog content', () => {
    const controller = new DeveloperPortalController();

    const html = controller.getPortal();

    expect(html).toContain('NexaFx Webhook Developer Portal');
    expect(html).toContain('transaction.created');
    expect(html).toContain('transaction.completed');
    expect(html).toContain('POST /webhooks/sandbox/:eventType');
  });
});
