import { AccountClosureController } from './account-closure.controller';

describe('AccountClosureController.exportData', () => {
  const controller = new AccountClosureController({} as any);

  it('derives the export target from the authenticated user', () => {
    const result = controller.exportData({ user: { sub: 'authuser-123' } });
    expect(result.exportId).toContain('authus');
  });

  it('does not accept a client-supplied x-user-id header', () => {
    // The handler signature only takes the request; the header is never read.
    expect(controller.exportData.length).toBe(1);
    const result = controller.exportData({
      user: { sub: 'authuser-123' },
      headers: { 'x-user-id': 'victim-999' },
    } as any);
    expect(result.exportId).not.toContain('victim');
  });
});
