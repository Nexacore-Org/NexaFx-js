import { SetMetadata } from '@nestjs/common';
import { RateLimitOptions } from '../interfaces/rate-limit-options.interface';

export const RATE_LIMIT_KEY = 'rateLimit';

export const RateLimit = (options: Partial<RateLimitOptions>) =>
  SetMetadata(RATE_LIMIT_KEY, options);

export const SkipRateLimit = () => SetMetadata('skipRateLimit', true);
