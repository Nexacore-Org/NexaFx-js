import { SetMetadata } from '@nestjs/common';

export const BYPASS_MAINTENANCE_KEY = 'bypassMaintenance';

/**
 * Decorator to allow specific routes to bypass maintenance mode
 * Usage: @BypassMaintenance() on controller methods
 */
export const BypassMaintenance = () =>
  SetMetadata(BYPASS_MAINTENANCE_KEY, true);