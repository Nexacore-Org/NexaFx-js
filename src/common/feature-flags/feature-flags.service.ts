import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FeatureFlagsService {
  constructor(private readonly config: ConfigService) {}

  isEnabled(feature: string): boolean {
    const key = `FEATURE_${feature.toUpperCase().replace(/-/g, '_')}`;
    return this.config.get<string>(key) === 'true';
  }

  getAll(): Record<string, boolean> {
    const features = ['fx-trading', 'referrals', 'blockchain', 'two-fa', 'push-notifications'];
    return Object.fromEntries(features.map((f) => [f, this.isEnabled(f)]));
  }
}