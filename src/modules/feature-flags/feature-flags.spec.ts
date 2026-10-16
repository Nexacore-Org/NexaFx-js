import { ExecutionContext, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagGuard } from './feature-flag.guard';
import { ALL_FEATURE_FLAGS, FeatureFlag, featureFlagEnvKey } from './feature-flags.catalog';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';
import { RequireFeature } from './require-feature.decorator';

const configWith = (values: Record<string, unknown>) => ({ get: jest.fn((k: string) => values[k]) }) as any;

describe('FeatureFlagsService (#1383)', () => {
  it('maps flags to FEATURE_* environment keys', () => {
    expect(featureFlagEnvKey(FeatureFlag.FX_TRADING)).toBe('FEATURE_FX_TRADING');
    expect(featureFlagEnvKey(FeatureFlag.PUSH_NOTIFICATIONS)).toBe('FEATURE_PUSH_NOTIFICATIONS');
  });

  it('is enabled only for "true" (or a validated boolean true)', () => {
    const service = new FeatureFlagsService(
      configWith({ FEATURE_REFERRALS: 'true', FEATURE_BLOCKCHAIN: true, FEATURE_FX_TRADING: 'false', FEATURE_TWO_FA: 'yes' }),
    );
    expect(service.isEnabled(FeatureFlag.REFERRALS)).toBe(true);
    expect(service.isEnabled(FeatureFlag.BLOCKCHAIN)).toBe(true);
    expect(service.isEnabled(FeatureFlag.FX_TRADING)).toBe(false);
    expect(service.isEnabled(FeatureFlag.TWO_FA)).toBe(false);
    expect(service.isEnabled(FeatureFlag.PUSH_NOTIFICATIONS)).toBe(false);
  });

  it('getAll() lists every catalogued flag', () => {
    const all = new FeatureFlagsService(configWith({ FEATURE_REFERRALS: 'true' })).getAll();
    expect(Object.keys(all).sort()).toEqual([...ALL_FEATURE_FLAGS].sort());
    expect(all[FeatureFlag.REFERRALS]).toBe(true);
    expect(all[FeatureFlag.FX_TRADING]).toBe(false);
  });

  it('exposes the flags through GET /feature-flags', () => {
    const controller = new FeatureFlagsController(new FeatureFlagsService(configWith({})));
    expect(controller.getAll()).toMatchObject({ referrals: false, 'fx-trading': false });
  });
});

describe('FeatureFlagGuard (#1383)', () => {
  class GatedController {
    @RequireFeature(FeatureFlag.REFERRALS)
    gated() {}
    open() {}
  }
  const ctx = (handler: Function) =>
    ({ getHandler: () => handler, getClass: () => GatedController }) as unknown as ExecutionContext;
  const guard = (values: Record<string, unknown>) =>
    new FeatureFlagGuard(new Reflector(), new FeatureFlagsService(configWith(values)));

  it('returns 404 while the flag is off', () => {
    expect(() => guard({}).canActivate(ctx(GatedController.prototype.gated))).toThrow(NotFoundException);
  });

  it('lets the request through when the flag is on', () => {
    expect(guard({ FEATURE_REFERRALS: 'true' }).canActivate(ctx(GatedController.prototype.gated))).toBe(true);
  });

  it('ignores routes that are not gated', () => {
    expect(guard({}).canActivate(ctx(GatedController.prototype.open))).toBe(true);
  });
});
