import { UnauthorizedException } from '@nestjs/common';
import { TermsController } from './terms.controller';

describe('TermsController', () => {
  it('records acceptance for the authenticated user', async () => {
    const termsService = {
      accept: jest.fn().mockResolvedValue({ userId: 'u1', version: '1.0' }),
    };
    const controller = new TermsController(termsService as any);

    const result = await controller.accept({
      user: { id: 'u1', sub: 'u1' },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    } as any);

    expect(termsService.accept).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', ipAddress: '127.0.0.1', userAgent: 'jest' }),
    );
    expect(result.userId).toBe('u1');
  });

  it('rejects requests without an authenticated user', () => {
    const controller = new TermsController({ accept: jest.fn() } as any);
    // accept() is synchronous, so the UnauthorizedException is thrown rather than returned as a rejection.
    expect(() => controller.accept({} as any)).toThrow(UnauthorizedException);
  });
});
