import { SetMetadata } from '@nestjs/common';

export const REQUIRE_SCOPES_KEY = 'requiredScopes';

/**
 * Decorator to specify required scopes for an endpoint
 * Usage: @RequireScopes('webhook:read', 'admin:write')
 */
export const RequireScopes = (...scopes: string[]) => SetMetadata(REQUIRE_SCOPES_KEY, scopes);
