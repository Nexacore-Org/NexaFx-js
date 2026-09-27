import { Test, TestingModule } from '@nestjs/testing';
import { KycService } from './kyc.service';
import { FxService } from '../fx/fx.service';
import { FeesService } from '../fees/fees.service';
import { AuthService } from '../auth/auth.service';

describe('mxllv Features (Issues #919, #918, #915, #912)', () => {
  it('KYC expiry check correctly identifies active vs expired approval', async () => {
    const mockKycRepo = {
      findOne: jest.fn().mockResolvedValue({
        userId: 'user-1',
        status: 'APPROVED',
        reviewedAt: new Date(Date.now() - 400 * 86_400_000), // 400 days old
      }),
    };
    const kycService = new KycService(mockKycRepo as any, {} as any, { get: () => '' } as any, {} as any);
    const result = await kycService.checkExpiry('user-1', 365);
    expect(result.isExpired).toBe(true);
    expect(result.isApproved).toBe(false);
  });

  it('FxService tracks and returns trading volume per currency pair', async () => {
    const fxService = new FxService({} as any, {} as any, {} as any, {} as any, {} as any);
    await fxService.getVolume();
    const volumeData = await fxService.getVolume('USD', 'NGN');
    expect(volumeData.pair).toBe('USD/NGN');
    expect(volumeData.volume).toBe(0);
  });

  it('FeesService previews deposit and withdrawal fees accurately', () => {
    const feesService = new FeesService({} as any, { recordFeeCalculation: jest.fn().mockResolvedValue(undefined) } as any);
    const depositPreview = feesService.previewFee('deposit', 1000, 'USD');
    expect(depositPreview.feeAmount).toBe(1.0);
    expect(depositPreview.netAmount).toBe(999.0);

    const withdrawPreview = feesService.previewFee('withdrawal', 1000, 'USD');
    expect(withdrawPreview.feeAmount).toBe(5.0);
    expect(withdrawPreview.netAmount).toBe(995.0);
  });

  it('AuthService supports refresh token rotation and rejects reused tokens', async () => {
    const mockJwt = {
      verify: jest.fn().mockReturnValue({ sub: 'user-1', email: 'test@example.com', role: 'user' }),
      sign: jest.fn().mockReturnValue('new-token-pair'),
    };
    const authService = new AuthService({} as any, {} as any, mockJwt as any, {} as any, {} as any, {} as any, {} as any, {} as any);

    const rotated = await authService.rotateRefreshToken('valid-refresh-token');
    expect(rotated.accessToken).toBe('new-token-pair');
    expect(rotated.refreshToken).toBe('new-token-pair');

    await expect(authService.rotateRefreshToken('valid-refresh-token')).rejects.toThrow('Refresh token has already been used');
  });
});
